import AVFoundation
import XCTest

@testable import ComposerCore

/// End-to-end: real files in, real files out, every frame checked against the plan.
final class ComposerTests: XCTestCase {
  // 4 s at 240 fps: 1 s normal, 1 s slowed 8x, 2 s normal → 1 + 8 + 2 = 11 s = 330 frames at 30 fps.
  private let segments = [
    ComposeSegment(srcStart: 0, srcEnd: 1, stretch: 1),
    ComposeSegment(srcStart: 1, srcEnd: 2, stretch: 8),
    ComposeSegment(srcStart: 2, srcEnd: 4, stretch: 1),
  ]
  private let size = (width: 180, height: 320)

  /// The source frame the plan puts on output frame `k`: the first source frame at or after its time.
  private func expectedSource(_ k: Int) -> Int {
    let target = Double(k) / 30 - 1e-6
    func outputTime(_ i: Int) -> Double {
      let s = Double(i) / 240
      if s < 1 { return s }
      if s < 2 { return 1 + (s - 1) * 8 }
      return 9 + (s - 2)
    }
    var i = 0
    while i < 959, outputTime(i) < target { i += 1 }
    return i
  }

  private func request(input: URL, reverse: Bool, overlay: URL? = nil, audio: URL? = nil) -> ComposeRequest {
    ComposeRequest(
      input: input, output: Fixtures.temporaryURL("mp4"), segments: segments, reverse: reverse, outputFps: 30,
      width: size.width, height: size.height, bitrate: 8_000_000, overlay: overlay, audio: audio)
  }

  func testEveryFrameComesFromWhereThePlanSays() async throws {
    let input = try await Fixtures.indexClip(frames: 960)
    let r = request(input: input, reverse: false)
    let result = try await Composer().compose(r) { _ in }

    XCTAssertEqual(result.duration, 11, accuracy: 0.001)
    XCTAssertGreaterThan(result.bytes, 0)
    let frames = try await Fixtures.frames(of: r.output)
    XCTAssertEqual(frames.count, 330)
    XCTAssertEqual(frames.first?.width, size.width)
    XCTAssertEqual(frames.first?.height, size.height)
    for (k, frame) in frames.enumerated() {
      XCTAssertEqual(Double(frame.index), Double(expectedSource(k)), accuracy: 1, "output frame \(k)")
    }
    // The slow part shows every source frame once: 240 consecutive frames, one per output frame.
    XCTAssertEqual(frames[31].index - frames[30].index, 1, accuracy: 1)
    XCTAssertEqual(frames[1].index - frames[0].index, 8, accuracy: 1)
  }

  func testReverseIsTheForwardVideoBackwards() async throws {
    let input = try await Fixtures.indexClip(frames: 960)
    let r = request(input: input, reverse: true)
    let result = try await Composer().compose(r) { _ in }

    XCTAssertEqual(result.duration, 22, accuracy: 0.001)
    let frames = try await Fixtures.frames(of: r.output)
    XCTAssertEqual(frames.count, 660)
    for j in 0..<330 {
      XCTAssertEqual(frames[330 + j].index, frames[329 - j].index, "reverse frame \(j)")
    }
    for (k, frame) in frames.prefix(330).enumerated() {
      XCTAssertEqual(Double(frame.index), Double(expectedSource(k)), accuracy: 1, "forward frame \(k)")
    }
  }

  func testPortraitRecordingsComeOutUpright() async throws {
    // Stored landscape with a white block top-left, plus the 90° transform an upright iPhone writes. Shown
    // upright, that block sits top-right.
    let rotate = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 180, ty: 0)
    let input = try await Fixtures.markerClip(transform: rotate)
    let r = ComposeRequest(
      input: input, output: Fixtures.temporaryURL("mp4"), segments: [ComposeSegment(srcStart: 0, srcEnd: 1, stretch: 1)],
      reverse: false, outputFps: 30, width: 180, height: 320, bitrate: 4_000_000)
    _ = try await Composer().compose(r) { _ in }
    let frame = try await Fixtures.frames(of: r.output)[5]
    XCTAssertGreaterThan(frame.average(x: 160, y: 20).g, 200, "top right should be the white block")
    XCTAssertLessThan(frame.average(x: 20, y: 20).g, 40, "top left should be black")
    XCTAssertLessThan(frame.average(x: 160, y: 300).g, 40, "bottom right should be black")
  }

  func testMirrorFlipsHorizontally() async throws {
    let rotate = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 180, ty: 0)
    let input = try await Fixtures.markerClip(transform: rotate)
    var r = ComposeRequest(
      input: input, output: Fixtures.temporaryURL("mp4"), segments: [ComposeSegment(srcStart: 0, srcEnd: 1, stretch: 1)],
      reverse: false, outputFps: 30, width: 180, height: 320, bitrate: 4_000_000)
    r.mirror = true
    _ = try await Composer().compose(r) { _ in }
    let frame = try await Fixtures.frames(of: r.output)[5]
    XCTAssertGreaterThan(frame.average(x: 20, y: 20).g, 200, "mirrored, the block is top left")
    XCTAssertLessThan(frame.average(x: 160, y: 20).g, 40)
  }

  func testOverlayIsDrawnOnTop() async throws {
    let input = try await Fixtures.indexClip(frames: 960)
    let overlay = try Fixtures.overlayPNG(width: 90, height: 160) // smaller than the output: scaled to fill
    let r = request(input: input, reverse: false, overlay: overlay)
    _ = try await Composer().compose(r) { _ in }
    let frame = try await Fixtures.frames(of: r.output)[100]
    let band = frame.average(x: 90, y: 300)
    XCTAssertGreaterThan(band.r, 200)
    XCTAssertLessThan(band.g, 60)
    // Above the band the picture shows through, still readable.
    XCTAssertEqual(Double(frame.index), Double(expectedSource(100)), accuracy: 1)
  }

  func testMusicIsAddedForTheWholeVideo() async throws {
    let input = try await Fixtures.indexClip(frames: 960)
    let tone = try Fixtures.tone(seconds: 5) // shorter than the 22 s video: it loops
    let r = request(input: input, reverse: true, audio: tone)
    _ = try await Composer().compose(r) { _ in }
    let asset = AVURLAsset(url: r.output)
    let audio = try await asset.loadTracks(withMediaType: .audio)
    XCTAssertEqual(audio.count, 1)
    let range = try await audio[0].load(.timeRange)
    XCTAssertEqual(range.duration.seconds, 22, accuracy: 0.1)
  }

  func testProgressRisesToOne() async throws {
    let input = try await Fixtures.indexClip(frames: 960)
    let seen = Progress()
    _ = try await Composer().compose(request(input: input, reverse: true)) { seen.record($0) }
    XCTAssertTrue(seen.isMonotonic)
    XCTAssertEqual(seen.last, 1)
  }

  func testCancelStopsAndLeavesNoFile() async throws {
    let input = try await Fixtures.indexClip(frames: 960)
    let r = request(input: input, reverse: true)
    let composer = Composer()
    composer.cancel()
    do {
      _ = try await composer.compose(r) { _ in }
      XCTFail("expected cancellation")
    } catch let error as ComposeError {
      XCTAssertEqual(error, .cancelled)
    }
    XCTAssertFalse(FileManager.default.fileExists(atPath: r.output.path))
  }

  func testAPlanLongerThanTheClipStopsAtTheClip() async throws {
    let input = try await Fixtures.indexClip(frames: 480) // 2 s, but the plan asks for 4
    let r = request(input: input, reverse: false)
    let result = try await Composer().compose(r) { _ in }
    XCTAssertEqual(result.duration, 9, accuracy: 0.05) // 1 + 8
  }
}

private final class Progress: @unchecked Sendable {
  private let lock = NSLock()
  private var values: [Double] = []

  func record(_ value: Double) {
    lock.lock()
    values.append(value)
    lock.unlock()
  }

  var isMonotonic: Bool { zip(values, values.dropFirst()).allSatisfy { $0 <= $1 + 1e-9 } }
  var last: Double? { values.last }
}

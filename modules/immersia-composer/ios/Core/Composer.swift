import AVFoundation
import CoreVideo
import Foundation
import ImageIO

/// Makes one video from one take.
///
/// 1. **Forward.** The segments are laid out in a composition, each stretched by its factor, so a 240 fps
///    clip played 8x slower still has a fresh frame for every 1/30 s. Every output frame takes the first
///    decoded frame at or after its time, then is oriented, cropped to fill, mirrored if asked and overlaid.
/// 2. **Reverse** (when on). The forward video is written at a high bitrate to a temporary file, then the final
///    file is written by one encoder: the forward frames in order, then the same frames backwards, read in
///    short windows from the end so memory stays bounded. One encoder for both halves keeps the stream uniform
///    (two separately encoded halves cannot be joined without re-encoding anyway).
/// 3. **Music** is written alongside whichever pass writes the final file.
public final class Composer: @unchecked Sendable {
  /// Frames held in memory per reverse window (half a second): about 47 MB at 1080 × 1920 in YUV.
  static let reverseWindow = 15
  /// The temporary forward video is a working copy, encoded richly so the second encode loses nothing visible:
  /// about 0.6 bits per pixel per frame (37 Mbps at 1080 × 1920 × 30), capped well inside H.264 levels, and
  /// never below the final bitrate.
  static func intermediateBitrate(_ request: ComposeRequest) -> Int {
    let rich = Double(request.width * request.height) * Double(request.outputFps) * 0.6
    return max(request.bitrate, min(60_000_000, Int(rich)))
  }

  private let lock = NSLock()
  private var cancelled = false

  public init() {}

  public func cancel() {
    lock.lock()
    cancelled = true
    lock.unlock()
  }

  private var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled || Task.isCancelled
  }

  private func checkCancelled() throws {
    if isCancelled { throw ComposeError.cancelled }
  }

  public func compose(_ request: ComposeRequest, progress: @escaping @Sendable (Double) -> Void) async throws -> ComposeResult {
    let files = FileManager.default
    try? files.removeItem(at: request.output)
    let temporary = files.temporaryDirectory.appendingPathComponent("immersia-forward-\(UUID().uuidString).mp4")
    defer { try? files.removeItem(at: temporary) }

    do {
      let timeline = try await Timeline.build(request)
      let frames = FrameMath.slotCount(duration: timeline.duration.seconds, fps: request.outputFps)
      guard frames > 0 else { throw ComposeError.emptyPlan }
      let totalFrames = request.reverse ? frames * 2 : frames
      var music: MusicTrack?
      if let audio = request.audio {
        music = try await MusicTrack.load(
          url: audio, start: request.audioStart, duration: Double(totalFrames) / Double(request.outputFps),
          fadeOut: request.audioFadeOut)
      }
      let renderer = try FrameRenderer(width: request.width, height: request.height, overlay: request.overlay)

      if request.reverse {
        let forward = try VideoSink(
          stage: "forward", url: temporary, width: request.width, height: request.height, fps: request.outputFps,
          bitrate: Self.intermediateBitrate(request), keyframeInterval: Self.reverseWindow, music: nil,
          allowFrameReordering: false)
        try await renderForward(timeline, frames: frames, request: request, renderer: renderer, into: forward) {
          progress($0 * 0.45)
        }
        let final = try VideoSink(
          stage: "final", url: request.output, width: request.width, height: request.height, fps: request.outputFps,
          bitrate: request.bitrate, keyframeInterval: Int(request.outputFps), music: music)
        try await writeBoomerang(from: temporary, frames: frames, fps: request.outputFps, renderer: renderer, into: final) {
          progress(0.45 + $0 * 0.55)
        }
      } else {
        let final = try VideoSink(
          stage: "final", url: request.output, width: request.width, height: request.height, fps: request.outputFps,
          bitrate: request.bitrate, keyframeInterval: Int(request.outputFps), music: music)
        try await renderForward(timeline, frames: frames, request: request, renderer: renderer, into: final, progress: progress)
      }

      progress(1)
      let bytes = (try? files.attributesOfItem(atPath: request.output.path)[.size] as? NSNumber)?.int64Value ?? 0
      return ComposeResult(duration: Double(totalFrames) / Double(request.outputFps), bytes: bytes)
    } catch {
      try? files.removeItem(at: request.output)
      throw error
    }
  }

  // MARK: Forward

  private func renderForward(
    _ timeline: Timeline, frames: Int, request: ComposeRequest, renderer: FrameRenderer, into sink: VideoSink,
    progress: (Double) -> Void
  ) async throws {
    do {
      let reader = try AVAssetReader(asset: timeline.composition)
      let output = AVAssetReaderTrackOutput(
        track: timeline.track,
        outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
      output.alwaysCopiesSampleData = false
      guard reader.canAdd(output) else { throw ComposeError.readerFailed("cannot read the video track") }
      reader.add(output)
      guard reader.startReading() else { throw ComposeError.readerFailed(describe(reader.error, stage: "reading start")) }
      defer { reader.cancelReading() }

      let pool = try sink.pool
      let fps = Double(request.outputFps)
      var next = 0
      var last: CVPixelBuffer?

      while next < frames, let sample = output.copyNextSampleBuffer() {
        try checkCancelled()
        guard let buffer = CMSampleBufferGetImageBuffer(sample) else { continue }
        let time = CMSampleBufferGetPresentationTimeStamp(sample).seconds
        // Every output frame whose time this decoded frame has reached gets this frame.
        while next < frames, Double(next) / fps <= time + 1e-6 {
          let rendered = try renderer.render(buffer, orientation: timeline.orientation, mirror: request.mirror, into: pool)
          try await sink.append(rendered, index: next, isCancelled: { isCancelled })
          next += 1
          progress(Double(next) / Double(frames))
        }
        last = buffer
      }
      if reader.status == .failed { throw ComposeError.readerFailed(describe(reader.error, stage: "reading")) }

      // The clip can end a frame or two before the plan does (rounding at the end): hold the last frame.
      if let last {
        while next < frames {
          let rendered = try renderer.render(last, orientation: timeline.orientation, mirror: request.mirror, into: pool)
          try await sink.append(rendered, index: next, isCancelled: { isCancelled })
          next += 1
        }
      }
      try await sink.finish(frames: frames)
    } catch {
      sink.cancel()
      throw error
    }
  }

  // MARK: Forward then backwards

  private func writeBoomerang(
    from forward: URL, frames: Int, fps: Int32, renderer: FrameRenderer, into sink: VideoSink,
    progress: (Double) -> Void
  ) async throws {
    do {
      let pool = try sink.pool
      let asset = AVURLAsset(url: forward)
      guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw ComposeError.noVideoTrack }
      let total = Double(frames * 2)

      // Forward half, in order. A frame that would not move time forward (a decoder repeat) is skipped:
      // the writer refuses timestamps that do not increase.
      var lastForward = -1
      try await readFrames(track: track, asset: asset, range: 0..<frames, fps: fps) { index, buffer in
        guard index > lastForward else { return }
        lastForward = index
        try await sink.append(renderer.copy(buffer, into: pool), index: index, isCancelled: { isCancelled })
        progress(Double(index + 1) / total)
      }

      // Backwards half: windows from the end, each read forwards and written reversed.
      var end = frames
      while end > 0 {
        try checkCancelled()
        let start = max(0, end - Self.reverseWindow)
        var window: [(Int, CVPixelBuffer)] = []
        window.reserveCapacity(end - start)
        try await readFrames(track: track, asset: asset, range: start..<end, fps: fps, copies: true) { index, buffer in
          window.append((index, buffer))
        }
        // Sorted by frame number, newest first, one buffer per number: the order must never depend on the
        // order the decoder hands frames back in.
        var seen = Set<Int>()
        let backwards = window.sorted { $0.0 > $1.0 }.filter { seen.insert($0.0).inserted }
        for (index, buffer) in backwards {
          let outputIndex = frames + (frames - 1 - index)
          try await sink.append(renderer.copy(buffer, into: pool), index: outputIndex, isCancelled: { isCancelled })
          progress(Double(outputIndex + 1) / total)
        }
        end = start
      }
      try await sink.finish(frames: frames * 2)
    } catch {
      sink.cancel()
      throw error
    }
  }

  /// Decodes the frames whose index (time × fps, rounded) falls in `range` and hands them over in order.
  /// The reader's window is offset by half a frame so the boundaries fall between frames, never on one.
  private func readFrames(
    track: AVAssetTrack, asset: AVAsset, range: Range<Int>, fps: Int32, copies: Bool = false,
    body: (Int, CVPixelBuffer) async throws -> Void
  ) async throws {
    let reader = try AVAssetReader(asset: asset)
    let start = (Double(range.lowerBound) - 0.5) / Double(fps)
    let end = (Double(range.upperBound) - 0.5) / Double(fps)
    reader.timeRange = CMTimeRange(
      start: CMTime(seconds: max(0, start), preferredTimescale: 600 * fps),
      end: CMTime(seconds: end, preferredTimescale: 600 * fps))
    let output = AVAssetReaderTrackOutput(
      track: track,
      // YUV, the encoder’s own input format: a third of the memory of BGRA while a window is held.
      outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
    // A window is held in memory while it is written backwards: it needs its own copies.
    output.alwaysCopiesSampleData = copies
    guard reader.canAdd(output) else { throw ComposeError.readerFailed("cannot read the forward video") }
    reader.add(output)
    guard reader.startReading() else { throw ComposeError.readerFailed(describe(reader.error, stage: "reading start")) }
    defer { reader.cancelReading() }

    while let sample = output.copyNextSampleBuffer() {
      try checkCancelled()
      guard let buffer = CMSampleBufferGetImageBuffer(sample) else { continue }
      let index = Int((CMSampleBufferGetPresentationTimeStamp(sample).seconds * Double(fps)).rounded())
      if range.contains(index) { try await body(index, buffer) }
    }
    if reader.status == .failed { throw ComposeError.readerFailed(describe(reader.error, stage: "reading")) }
  }
}

/// The take laid out with every segment stretched, ready to read frame by frame.
struct Timeline {
  let composition: AVMutableComposition
  let track: AVMutableCompositionTrack
  let orientation: CGImagePropertyOrientation
  let duration: CMTime

  /// Fine enough for every camera frame rate (24, 25, 30, 60, 120, 240 all divide it).
  static let timescale: CMTimeScale = 24_000

  static func build(_ request: ComposeRequest) async throws -> Timeline {
    guard !request.segments.isEmpty else { throw ComposeError.emptyPlan }
    let asset = AVURLAsset(url: request.input, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    guard let source = try await asset.loadTracks(withMediaType: .video).first else { throw ComposeError.noVideoTrack }
    let (transform, sourceRange) = try await source.load(.preferredTransform, .timeRange)

    let composition = AVMutableComposition()
    guard let track = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw ComposeError.readerFailed("cannot lay out the take")
    }
    var cursor = CMTime.zero
    for segment in request.segments {
      let start = CMTimeAdd(sourceRange.start, CMTime(seconds: segment.srcStart, preferredTimescale: timescale))
      let end = CMTimeMinimum(
        CMTimeAdd(sourceRange.start, CMTime(seconds: segment.srcEnd, preferredTimescale: timescale)), sourceRange.end)
      guard end > start else { continue }
      let range = CMTimeRange(start: start, end: end)
      try track.insertTimeRange(range, of: source, at: cursor)
      let stretched = CMTimeMultiplyByFloat64(range.duration, multiplier: segment.stretch)
      if segment.stretch != 1 {
        track.scaleTimeRange(CMTimeRange(start: cursor, duration: range.duration), toDuration: stretched)
      }
      cursor = CMTimeAdd(cursor, stretched)
    }
    guard cursor > .zero else { throw ComposeError.emptyPlan }
    return Timeline(composition: composition, track: track, orientation: FrameMath.orientation(of: transform), duration: cursor)
  }
}

import AVFoundation
import CoreVideo
import Foundation

/// An H.264 MP4 being written frame by frame at a fixed frame rate, with an optional music track fed alongside
/// on its own queue (the writer interleaves the two; feeding only video would stall it).
final class VideoSink {
  private let writer: AVAssetWriter
  private let video: AVAssetWriterInput
  private let adaptor: AVAssetWriterInputPixelBufferAdaptor
  private let fps: Int32
  private let music: MusicFeed?

  init(url: URL, width: Int, height: Int, fps: Int32, bitrate: Int, keyframeInterval: Int, music: MusicTrack?) throws {
    try? FileManager.default.removeItem(at: url)
    writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true // moov first: the video starts playing before it has downloaded
    self.fps = fps

    video = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoColorPropertiesKey: [
          AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
          AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
          AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
        ],
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: bitrate,
          AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
          AVVideoExpectedSourceFrameRateKey: fps,
          AVVideoMaxKeyFrameIntervalKey: keyframeInterval,
          AVVideoAllowFrameReorderingKey: true,
        ],
      ]
    )
    video.expectsMediaDataInRealTime = false
    adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: video,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:] as [String: Any],
      ]
    )
    guard writer.canAdd(video) else { throw ComposeError.writerFailed("cannot add the video track") }
    writer.add(video)

    if let music {
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: MusicTrack.aacSettings)
      input.expectsMediaDataInRealTime = false
      guard writer.canAdd(input) else { throw ComposeError.writerFailed("cannot add the music track") }
      writer.add(input)
      self.music = MusicFeed(track: music, input: input)
    } else {
      self.music = nil
    }

    guard writer.startWriting() else { throw ComposeError.writerFailed(writer.error?.localizedDescription ?? "start") }
    writer.startSession(atSourceTime: .zero)
    try self.music?.start()
  }

  /// Buffers for rendered frames, sized and formatted for this writer.
  var pool: CVPixelBufferPool {
    get throws {
      guard let pool = adaptor.pixelBufferPool else { throw ComposeError.writerFailed(writer.error?.localizedDescription ?? "no pool") }
      return pool
    }
  }

  /// Appends a frame as output frame `index` (time = index / fps). Waits while the encoder is busy.
  func append(_ buffer: CVPixelBuffer, index: Int, isCancelled: () -> Bool) async throws {
    while !video.isReadyForMoreMediaData {
      if writer.status == .failed { throw ComposeError.writerFailed(writer.error?.localizedDescription ?? "failed") }
      if isCancelled() { throw ComposeError.cancelled }
      try await Task.sleep(nanoseconds: 2_000_000)
    }
    guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(index), timescale: fps)) else {
      throw ComposeError.writerFailed(writer.error?.localizedDescription ?? "append")
    }
  }

  func finish(frames: Int) async throws {
    video.markAsFinished()
    if let music { await music.finished() }
    writer.endSession(atSourceTime: CMTime(value: Int64(frames), timescale: fps))
    await writer.finishWriting()
    if writer.status != .completed {
      throw ComposeError.writerFailed(writer.error?.localizedDescription ?? "finish (\(writer.status.rawValue))")
    }
  }

  func cancel() {
    music?.stop()
    writer.cancelWriting()
  }
}

/// Feeds a music track into an audio writer input whenever the writer asks for more.
private final class MusicFeed: @unchecked Sendable {
  private let track: MusicTrack
  private let input: AVAssetWriterInput
  private let queue = DispatchQueue(label: "immersia.composer.music")
  private let done = DispatchGroup()
  private var stopped = false
  private var finishedFeeding = false

  init(track: MusicTrack, input: AVAssetWriterInput) {
    self.track = track
    self.input = input
  }

  func start() throws {
    let output = try track.startReading()
    done.enter()
    // Runs on `queue` only, so the flags need no lock.
    input.requestMediaDataWhenReady(on: queue) { [self] in
      while input.isReadyForMoreMediaData && !finishedFeeding {
        if !stopped, let sample = output.copyNextSampleBuffer() {
          input.append(sample)
        } else {
          finishedFeeding = true
          input.markAsFinished()
          done.leave()
        }
      }
    }
  }

  func stop() {
    queue.sync { stopped = true }
  }

  func finished() async {
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      done.notify(queue: queue) { continuation.resume() }
    }
  }
}

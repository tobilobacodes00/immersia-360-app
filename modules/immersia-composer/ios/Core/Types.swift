import Foundation

/// A stretch of the recorded clip and how many times longer it plays (1 = real time, 8 = 8x slow motion).
/// Built by `src/domain/timeline.ts`; the engine executes it and makes no timing decisions of its own.
public struct ComposeSegment: Equatable, Sendable {
  public var srcStart: Double
  public var srcEnd: Double
  public var stretch: Double

  public init(srcStart: Double, srcEnd: Double, stretch: Double) {
    self.srcStart = srcStart
    self.srcEnd = srcEnd
    self.stretch = stretch
  }
}

public struct ComposeRequest: Sendable {
  public var input: URL
  public var output: URL
  public var segments: [ComposeSegment]
  /// Append the whole forward video again, played backwards.
  public var reverse: Bool
  public var outputFps: Int32
  /// Portrait output size; the source is scaled to fill it and centre-cropped.
  public var width: Int
  public var height: Int
  /// H.264 bitrate of the final video, bits per second.
  public var bitrate: Int
  /// PNG with transparency drawn over every frame, scaled to fill.
  public var overlay: URL?
  /// Music for the whole video, from `audioStart`, looped if short, faded out over `audioFadeOut` seconds.
  public var audio: URL?
  public var audioStart: Double
  public var audioFadeOut: Double
  /// Flip horizontally after orienting (the front camera's "Mirror video").
  public var mirror: Bool

  public init(
    input: URL, output: URL, segments: [ComposeSegment], reverse: Bool, outputFps: Int32, width: Int, height: Int,
    bitrate: Int, overlay: URL? = nil, audio: URL? = nil, audioStart: Double = 0, audioFadeOut: Double = 1,
    mirror: Bool = false
  ) {
    self.input = input
    self.output = output
    self.segments = segments
    self.reverse = reverse
    self.outputFps = outputFps
    self.width = width
    self.height = height
    self.bitrate = bitrate
    self.overlay = overlay
    self.audio = audio
    self.audioStart = audioStart
    self.audioFadeOut = audioFadeOut
    self.mirror = mirror
  }
}

public struct ComposeResult: Sendable {
  /// Length of the final video in seconds.
  public var duration: Double
  public var bytes: Int64
}

public enum ComposeError: Error, LocalizedError, Equatable {
  case cancelled
  case noVideoTrack
  case emptyPlan
  case overlayUnreadable
  case audioUnreadable
  case readerFailed(String)
  case writerFailed(String)

  public var errorDescription: String? {
    switch self {
    case .cancelled: return "Cancelled."
    case .noVideoTrack: return "The recording has no video in it."
    case .emptyPlan: return "There is nothing to make: the take is empty."
    case .overlayUnreadable: return "The overlay frame could not be read. Choose it again in Overlays."
    case .audioUnreadable: return "The music file could not be read. Choose it again in Overlays."
    case .readerFailed(let reason): return "The recording could not be read (\(reason))."
    case .writerFailed(let reason): return "The video could not be written (\(reason))."
    }
  }
}

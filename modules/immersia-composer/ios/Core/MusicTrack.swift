import AVFoundation
import Foundation

/// The music for one video: the chosen track from its start point, looped if it is shorter than the video,
/// cut to the video's length and faded out at the end. Read as PCM and encoded to AAC by the writer.
final class MusicTrack {
  static let aacSettings: [String: Any] = [
    AVFormatIDKey: kAudioFormatMPEG4AAC,
    AVSampleRateKey: 44_100,
    AVNumberOfChannelsKey: 2,
    AVEncoderBitRateKey: 160_000,
  ]

  private static let pcmSettings: [String: Any] = [
    AVFormatIDKey: kAudioFormatLinearPCM,
    AVSampleRateKey: 44_100,
    AVNumberOfChannelsKey: 2,
    AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false,
    AVLinearPCMIsNonInterleaved: false,
  ]

  private let composition: AVMutableComposition
  private let track: AVMutableCompositionTrack
  private let mix: AVMutableAudioMix
  private var reader: AVAssetReader?

  private init(composition: AVMutableComposition, track: AVMutableCompositionTrack, mix: AVMutableAudioMix) {
    self.composition = composition
    self.track = track
    self.mix = mix
  }

  static func load(url: URL, start: Double, duration: Double, fadeOut: Double) async throws -> MusicTrack {
    let asset = AVURLAsset(url: url)
    guard let source = try await asset.loadTracks(withMediaType: .audio).first else { throw ComposeError.audioUnreadable }
    let length = try await asset.load(.duration)
    guard length.seconds > 0.1 else { throw ComposeError.audioUnreadable }

    let composition = AVMutableComposition()
    guard let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw ComposeError.audioUnreadable
    }
    let timescale: CMTimeScale = 44_100
    let total = CMTime(seconds: duration, preferredTimescale: timescale)
    // A start point past the end of the song starts it from the top instead.
    var from = CMTime(seconds: start < length.seconds - 0.1 ? max(0, start) : 0, preferredTimescale: timescale)
    var cursor = CMTime.zero
    while cursor < total {
      let available = CMTimeSubtract(length, from)
      let piece = CMTimeMinimum(available, CMTimeSubtract(total, cursor))
      try track.insertTimeRange(CMTimeRange(start: from, duration: piece), of: source, at: cursor)
      cursor = CMTimeAdd(cursor, piece)
      from = .zero // loops start from the beginning of the song
    }

    let parameters = AVMutableAudioMixInputParameters(track: track)
    let fade = CMTime(seconds: min(max(0, fadeOut), duration), preferredTimescale: timescale)
    if fade > .zero {
      parameters.setVolumeRamp(fromStartVolume: 1, toEndVolume: 0, timeRange: CMTimeRange(start: CMTimeSubtract(total, fade), duration: fade))
    }
    let mix = AVMutableAudioMix()
    mix.inputParameters = [parameters]
    return MusicTrack(composition: composition, track: track, mix: mix)
  }

  func startReading() throws -> AVAssetReaderOutput {
    let reader = try AVAssetReader(asset: composition)
    let output = AVAssetReaderAudioMixOutput(audioTracks: [track], audioSettings: Self.pcmSettings)
    output.audioMix = mix
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw ComposeError.audioUnreadable }
    reader.add(output)
    guard reader.startReading() else { throw ComposeError.readerFailed(reader.error?.localizedDescription ?? "music") }
    self.reader = reader
    return output
  }
}

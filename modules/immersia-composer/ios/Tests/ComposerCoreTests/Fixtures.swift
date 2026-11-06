import AVFoundation
import CoreGraphics
import CoreVideo
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Synthetic media for the tests, written on the fly so nothing binary lives in the repo.
enum Fixtures {
  static func temporaryURL(_ ext: String) -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("composer-test-\(UUID().uuidString).\(ext)")
  }

  /// A clip whose frame `i` shows its own index: the left half is grey `(i % 32) * 8 + 4`, the right half
  /// `(i / 32) * 8 + 4`. Flat areas survive H.264 within a level or two, so `decodeIndex` can read them back.
  static func indexClip(width: Int = 320, height: Int = 180, fps: Int32 = 240, frames: Int, transform: CGAffineTransform = .identity) async throws -> URL {
    try await writeClip(width: width, height: height, fps: fps, frames: frames, transform: transform) { i, x, _ in
      let level = x < width / 2 ? (i % 32) * 8 + 4 : (i / 32) * 8 + 4
      return (UInt8(level), UInt8(level), UInt8(level))
    }
  }

  /// A black clip with a white block in its stored top-left corner, to check orientation.
  static func markerClip(width: Int = 320, height: Int = 180, transform: CGAffineTransform) async throws -> URL {
    try await writeClip(width: width, height: height, fps: 30, frames: 30, transform: transform) { _, x, y in
      x < width / 4 && y < height / 4 ? (255, 255, 255) : (0, 0, 0)
    }
  }

  private static func writeClip(
    width: Int, height: Int, fps: Int32, frames: Int, transform: CGAffineTransform,
    pixel: (_ frame: Int, _ x: Int, _ y: Int) -> (UInt8, UInt8, UInt8)
  ) async throws -> URL {
    let url = temporaryURL("mov")
    let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 20_000_000],
    ])
    input.transform = transform
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
    ])
    writer.add(input)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    for i in 0..<frames {
      while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 1_000_000) }
      var buffer: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
      let pb = buffer!
      CVPixelBufferLockBaseAddress(pb, [])
      let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
      let stride = CVPixelBufferGetBytesPerRow(pb)
      for y in 0..<height {
        for x in 0..<width {
          let (r, g, b) = pixel(i, x, y)
          let p = base + y * stride + x * 4
          p[0] = b
          p[1] = g
          p[2] = r
          p[3] = 255
        }
      }
      CVPixelBufferUnlockBaseAddress(pb, [])
      adaptor.append(pb, withPresentationTime: CMTime(value: Int64(i), timescale: fps))
    }
    input.markAsFinished()
    await writer.finishWriting()
    guard writer.status == .completed else { throw writer.error ?? CocoaError(.fileWriteUnknown) }
    return url
  }

  /// A PNG of `width × height`, transparent except an opaque red band across the bottom quarter.
  static func overlayPNG(width: Int, height: Int) throws -> URL {
    let url = temporaryURL("png")
    let context = CGContext(
      data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.clear(CGRect(x: 0, y: 0, width: width, height: height))
    context.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height / 4)) // CG origin is bottom-left
    let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, context.makeImage()!, nil)
    guard CGImageDestinationFinalize(destination) else { throw CocoaError(.fileWriteUnknown) }
    return url
  }

  /// A 440 Hz tone, `seconds` long, as a WAV file.
  static func tone(seconds: Double) throws -> URL {
    let url = temporaryURL("wav")
    let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 2)!
    let file = try AVAudioFile(forWriting: url, settings: format.settings)
    let count = AVAudioFrameCount(seconds * 44_100)
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count)!
    buffer.frameLength = count
    for channel in 0..<2 {
      let samples = buffer.floatChannelData![channel]
      for i in 0..<Int(count) { samples[i] = 0.4 * sin(2 * .pi * 440 * Float(i) / 44_100) }
    }
    try file.write(from: buffer)
    return url
  }

  // MARK: Reading results

  struct Frame {
    let width: Int
    let height: Int
    let pixels: [UInt8] // BGRA, row 0 at the top

    /// Average (r, g, b) of a square patch centred on (x, y).
    func average(x: Int, y: Int, radius: Int = 6) -> (r: Double, g: Double, b: Double) {
      var sum = (r: 0.0, g: 0.0, b: 0.0)
      var n = 0.0
      for yy in max(0, y - radius)..<min(height, y + radius) {
        for xx in max(0, x - radius)..<min(width, x + radius) {
          let p = (yy * width + xx) * 4
          sum.b += Double(pixels[p])
          sum.g += Double(pixels[p + 1])
          sum.r += Double(pixels[p + 2])
          n += 1
        }
      }
      return (sum.r / n, sum.g / n, sum.b / n)
    }

    /// The source frame index an `indexClip` frame shows, read from the middle of each half.
    var index: Int {
      let low = Int(((average(x: width / 4, y: height / 2).g - 4) / 8).rounded())
      let high = Int(((average(x: 3 * width / 4, y: height / 2).g - 4) / 8).rounded())
      return low + 32 * high
    }
  }

  static func frames(of url: URL) async throws -> [Frame] {
    let asset = AVURLAsset(url: url)
    let track = try await asset.loadTracks(withMediaType: .video).first!
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    ])
    reader.add(output)
    reader.startReading()
    var frames: [Frame] = []
    while let sample = output.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sample) {
      CVPixelBufferLockBaseAddress(pb, .readOnly)
      let width = CVPixelBufferGetWidth(pb)
      let height = CVPixelBufferGetHeight(pb)
      let stride = CVPixelBufferGetBytesPerRow(pb)
      let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
      var pixels = [UInt8](repeating: 0, count: width * height * 4)
      for y in 0..<height {
        for x in 0..<(width * 4) { pixels[y * width * 4 + x] = base[y * stride + x] }
      }
      CVPixelBufferUnlockBaseAddress(pb, .readOnly)
      frames.append(Frame(width: width, height: height, pixels: pixels))
    }
    return frames
  }
}

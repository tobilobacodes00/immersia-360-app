import CoreImage
import CoreVideo
import Foundation
import ImageIO

/// Turns one camera frame into one output frame: upright, mirrored if asked, scaled to fill the output and
/// centre-cropped, with the overlay frame on top. One Core Image context for the whole video (they are costly).
final class FrameRenderer {
  let size: CGSize
  private let context: CIContext
  private let overlay: CIImage?

  init(width: Int, height: Int, overlay overlayURL: URL?) throws {
    size = CGSize(width: width, height: height)
    // No colour management: the camera records BT.709 and the output is tagged BT.709, so pixel values pass
    // straight through. Converting through a linear working space would shift every grey and skin tone.
    context = CIContext(options: [.cacheIntermediates: false, .workingColorSpace: NSNull()])
    if let overlayURL {
      guard let image = CIImage(contentsOf: overlayURL) else { throw ComposeError.overlayUnreadable }
      overlay = image
        .transformed(by: FrameMath.fill(image.extent, into: size))
        .cropped(to: CGRect(origin: .zero, size: size))
    } else {
      overlay = nil
    }
  }

  /// Redraws an already finished frame (the reverse pass) into one of the writer's own buffers, so the encoder
  /// always receives buffers it made: same format, size and stride, whatever the decoder handed back.
  func copy(_ source: CVPixelBuffer, into pool: CVPixelBufferPool) throws -> CVPixelBuffer {
    try draw(CIImage(cvPixelBuffer: source), into: pool)
  }

  func render(
    _ source: CVPixelBuffer,
    orientation: CGImagePropertyOrientation,
    mirror: Bool,
    into pool: CVPixelBufferPool
  ) throws -> CVPixelBuffer {
    var image = CIImage(cvPixelBuffer: source).oriented(orientation)
    if mirror { image = image.transformed(by: CGAffineTransform(scaleX: -1, y: 1)) }
    image = image
      .transformed(by: FrameMath.fill(image.extent, into: size))
      .cropped(to: CGRect(origin: .zero, size: size))
    if let overlay { image = overlay.composited(over: image) }
    return try draw(image, into: pool)
  }

  private func draw(_ image: CIImage, into pool: CVPixelBufferPool) throws -> CVPixelBuffer {
    var output: CVPixelBuffer?
    let status = CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &output)
    guard status == kCVReturnSuccess, let output else {
      throw ComposeError.writerFailed("no frame buffer available (\(status))")
    }
    context.render(image, to: output, bounds: CGRect(origin: .zero, size: size), colorSpace: nil)
    return output
  }
}

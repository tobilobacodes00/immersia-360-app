import CoreGraphics
import ImageIO

/// Pure geometry and timing, kept apart so the tests can pin it down exactly.
public enum FrameMath {
  /// The EXIF orientation that displays a video track upright, from its `preferredTransform`.
  ///
  /// Cameras store frames in sensor orientation (landscape) and record how to turn them; an iPhone held upright
  /// writes a 90° clockwise transform, which is EXIF `.right`. A transform with a reflection in it (determinant
  /// below zero) is a mirror followed by a rotation, which EXIF also names (`.rightMirrored` and so on).
  public static func orientation(of t: CGAffineTransform) -> CGImagePropertyOrientation {
    let mirrored = t.a * t.d - t.b * t.c < 0
    // Remove the mirror (applied first) to read the rotation on its own.
    let rotation = mirrored ? CGAffineTransform(scaleX: -1, y: 1).concatenating(t) : t
    let quarterTurns = Int((atan2(rotation.b, rotation.a) / (.pi / 2)).rounded())
    switch ((quarterTurns % 4) + 4) % 4 {
    case 1: return mirrored ? .rightMirrored : .right
    case 2: return mirrored ? .downMirrored : .down
    case 3: return mirrored ? .leftMirrored : .left
    default: return mirrored ? .upMirrored : .up
    }
  }

  /// Scales `extent` to cover `target` and centres it: the parts that overflow are cropped off evenly.
  public static func fill(_ extent: CGRect, into target: CGSize) -> CGAffineTransform {
    guard extent.width > 0, extent.height > 0 else { return .identity }
    let scale = max(target.width / extent.width, target.height / extent.height)
    let dx = (target.width - extent.width * scale) / 2
    let dy = (target.height - extent.height * scale) / 2
    return CGAffineTransform(translationX: -extent.minX, y: -extent.minY)
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
      .concatenating(CGAffineTransform(translationX: dx, y: dy))
  }

  /// Output frames for a forward video of `duration` seconds.
  public static func slotCount(duration: Double, fps: Int32) -> Int {
    max(0, Int((duration * Double(fps)).rounded()))
  }
}

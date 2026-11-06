import CoreGraphics
import ImageIO
import XCTest

@testable import ComposerCore

final class FrameMathTests: XCTestCase {
  func testOrientationOfTheTransformsCamerasWrite() {
    XCTAssertEqual(FrameMath.orientation(of: .identity), .up)
    // iPhone held upright: rotate 90° clockwise.
    XCTAssertEqual(FrameMath.orientation(of: CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 1080, ty: 0)), .right)
    XCTAssertEqual(FrameMath.orientation(of: CGAffineTransform(a: 0, b: -1, c: 1, d: 0, tx: 0, ty: 1920)), .left)
    XCTAssertEqual(FrameMath.orientation(of: CGAffineTransform(a: -1, b: 0, c: 0, d: -1, tx: 1920, ty: 1080)), .down)
  }

  func testMirroredTransformsKeepTheirMirror() {
    let flip = CGAffineTransform(scaleX: -1, y: 1)
    XCTAssertEqual(FrameMath.orientation(of: flip), .upMirrored)
    XCTAssertEqual(FrameMath.orientation(of: flip.concatenating(CGAffineTransform(rotationAngle: .pi / 2))), .rightMirrored)
    XCTAssertEqual(FrameMath.orientation(of: flip.concatenating(CGAffineTransform(rotationAngle: -.pi / 2))), .leftMirrored)
  }

  func testFillCoversTheTargetAndCentres() {
    // A landscape 1920 × 1080 frame into a portrait 1080 × 1920 output: scaled up to 1920 tall, sides cropped.
    let t = FrameMath.fill(CGRect(x: 0, y: 0, width: 1920, height: 1080), into: CGSize(width: 1080, height: 1920))
    let mapped = CGRect(x: 0, y: 0, width: 1920, height: 1080).applying(t)
    XCTAssertEqual(mapped.height, 1920, accuracy: 0.001)
    XCTAssertEqual(mapped.midX, 540, accuracy: 0.001)
    XCTAssertEqual(mapped.midY, 960, accuracy: 0.001)
    XCTAssertLessThanOrEqual(mapped.minX, 0)
  }

  func testFillMovesAnOffsetExtentToTheOrigin() {
    let t = FrameMath.fill(CGRect(x: -100, y: 50, width: 200, height: 400), into: CGSize(width: 100, height: 200))
    let mapped = CGRect(x: -100, y: 50, width: 200, height: 400).applying(t)
    XCTAssertEqual(mapped.minX, 0, accuracy: 0.001)
    XCTAssertEqual(mapped.minY, 0, accuracy: 0.001)
    XCTAssertEqual(mapped.width, 100, accuracy: 0.001)
  }

  func testSlotCount() {
    XCTAssertEqual(FrameMath.slotCount(duration: 41, fps: 30), 1230)
    XCTAssertEqual(FrameMath.slotCount(duration: 0.0166, fps: 30), 0)
    XCTAssertEqual(FrameMath.slotCount(duration: 11.999_999, fps: 30), 360)
  }
}

// swift-tools-version:5.9
// Lets the engine in Core/ be built and tested on a Mac (`swift test`) without Xcode, Expo or a phone.
// The app does not use this file: the podspec compiles Core/ straight into the module.
import PackageDescription

let package = Package(
  name: "ComposerCore",
  platforms: [.macOS(.v13), .iOS("16.4")],
  products: [.library(name: "ComposerCore", targets: ["ComposerCore"])],
  targets: [
    .target(name: "ComposerCore", path: "Core"),
    .testTarget(name: "ComposerCoreTests", dependencies: ["ComposerCore"], path: "Tests/ComposerCoreTests"),
  ]
)

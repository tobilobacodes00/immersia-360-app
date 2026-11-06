Pod::Spec.new do |s|
  s.name           = 'ImmersiaComposer'
  s.version        = '1.0.0'
  s.summary        = 'Makes Immersia 360 videos: retimed slow motion, reverse, overlay frame and music.'
  s.description    = s.summary
  s.license        = { :type => 'Proprietary' }
  s.author         = 'Immersia'
  s.homepage       = 'https://github.com/tobilobacodes00/immersia-360-app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Core/ is the engine (no Expo imports, unit-tested with `swift test` via Package.swift); the module file is
  # the bridge. The Swift package manifest and its tests are not part of the app.
  s.source_files = 'ImmersiaComposerModule.swift', 'Core/**/*.swift'
  s.frameworks = 'AVFoundation', 'CoreImage', 'CoreMedia', 'CoreVideo'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end

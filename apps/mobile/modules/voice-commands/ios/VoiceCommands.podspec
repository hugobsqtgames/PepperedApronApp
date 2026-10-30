Pod::Spec.new do |s|
  s.name           = 'VoiceCommands'
  s.version        = '1.0.0'
  s.summary        = 'Cook mode voice commands, recognised on the device'
  s.description    = 'Listens to the microphone and recognises speech with Apple Speech, on the device only.'
  s.license        = 'UNLICENSED'
  s.author         = 'PepperedApron'
  s.homepage       = 'https://pepperedapron.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'AVFoundation', 'Speech'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files   = '**/*.{h,m,swift}'
end

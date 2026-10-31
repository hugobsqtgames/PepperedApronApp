Pod::Spec.new do |s|
  s.name           = 'TextVision'
  s.version        = '1.0.0'
  s.summary        = 'Text recognition on the device'
  s.description    = 'Reads printed and handwritten text in pictures with Apple Vision, in the languages asked, with line positions.'
  s.license        = 'UNLICENSED'
  s.author         = 'PepperedApron'
  s.homepage       = 'https://pepperedapron.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'Vision', 'ImageIO', 'UIKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files   = '**/*.{h,m,swift}'
end

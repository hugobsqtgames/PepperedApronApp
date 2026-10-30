Pod::Spec.new do |s|
  s.name           = 'IosIntegration'
  s.version        = '1.0.0'
  s.summary        = 'Spotlight and Handoff for PepperedApron'
  s.description    = 'Indexes recipes in Spotlight (on the device) and publishes the current recipe for Handoff.'
  s.license        = 'UNLICENSED'
  s.author         = 'PepperedApron'
  s.homepage       = 'https://pepperedapron.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'CoreSpotlight', 'UniformTypeIdentifiers', 'UIKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files   = '**/*.{h,m,swift}'
end

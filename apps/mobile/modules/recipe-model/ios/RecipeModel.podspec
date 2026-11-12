Pod::Spec.new do |s|
  s.name           = 'RecipeModel'
  s.version        = '1.0.0'
  s.summary        = 'On-device language model for recipe videos'
  s.description    = 'Uses Apple Foundation Models (on the device, iOS 26+, Apple Intelligence) to structure a recipe from what a video shows and says.'
  s.license        = 'UNLICENSED'
  s.author         = 'PepperedApron'
  s.homepage       = 'https://pepperedapron.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  # Weak: the framework is missing before iOS 26, where the module answers "unavailable".
  s.weak_frameworks = 'FoundationModels'
  s.source_files   = '**/*.{h,m,swift}'
end

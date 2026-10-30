Pod::Spec.new do |s|
  s.name           = 'PdfText'
  s.version        = '1.0.0'
  s.summary        = 'Text of a PDF read on the device'
  s.description    = 'Reads the text of a PDF with PDFKit; renders the pages of a scanned PDF for text recognition.'
  s.license        = 'UNLICENSED'
  s.author         = 'PepperedApron'
  s.homepage       = 'https://pepperedapron.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'PDFKit', 'UIKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files   = '**/*.{h,m,swift}'
end

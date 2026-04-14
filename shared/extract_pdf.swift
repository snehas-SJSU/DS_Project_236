import Foundation
import PDFKit

if CommandLine.arguments.count < 2 {
    print("Please provide a path to a PDF file")
    exit(1)
}

let path = CommandLine.arguments[1]
let url = URL(fileURLWithPath: path)

if let document = PDFDocument(url: url) {
    if let text = document.string {
        print(text)
    } else {
        print("Could not extract text from document")
    }
} else {
    print("Could not load document at \(path)")
}

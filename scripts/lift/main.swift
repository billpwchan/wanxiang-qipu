// 用 Apple Vision 的「主体抠图」把原画里的人物抠出来：lift <in.jpg> <out.png>
// 输出与原图同尺寸的 RGBA PNG（背景透明），stdout 打印主体外接框（归一化，原点左上）。
import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

@main
struct Lift {
    static func main() throws {
        let args = CommandLine.arguments
        guard args.count >= 3 else { print("usage: lift in out"); exit(64) }
        let url = URL(fileURLWithPath: args[1])
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil), let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { exit(66) }
        let handler = VNImageRequestHandler(cgImage: cg, options: [:])
        let req = VNGenerateForegroundInstanceMaskRequest()
        try handler.perform([req])
        guard let obs = req.results?.first else { print("{\"ok\":false}"); exit(2) }
        let buf = try obs.generateMaskedImage(ofInstances: obs.allInstances, from: handler, croppedToInstancesExtent: false)
        let ci = CIImage(cvPixelBuffer: buf)
        let ctx = CIContext()
        try ctx.writePNGRepresentation(of: ci, to: URL(fileURLWithPath: args[2]), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
        print("{\"ok\":true,\"instances\":\(obs.allInstances.count),\"w\":\(cg.width),\"h\":\(cg.height)}")
    }
}

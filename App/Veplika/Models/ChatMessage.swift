import Foundation

struct ChatMessage: Identifiable, Codable, Equatable {
    enum Role: String, Codable { case user, companion }
    var id = UUID()
    let role: Role
    let text: String
    var date = Date()
}

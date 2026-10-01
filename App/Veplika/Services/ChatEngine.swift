import Foundation

struct Reply {
    let text: String
    let gesture: Gesture?
}

/// Swap in a real LLM-backed engine here later; the rest of the app only talks to this protocol.
protocol ChatEngine {
    func reply(to text: String, history: [ChatMessage], companion: Companion, language: Language) async throws -> Reply
}

/// Offline, persona-flavoured canned replies so the UI and interaction loop are fully testable.
struct MockChatEngine: ChatEngine {
    private enum Intent { case greet, sad, happy, praise, thanks, bye, joke, question, other }

    func reply(to text: String, history: [ChatMessage], companion: Companion, language: Language) async throws -> Reply {
        try await Task.sleep(for: .milliseconds(Int.random(in: 900...1700)))
        let intent = classify(text)
        let bank = Self.lines[companion.id]?[language] ?? Self.lines["mint"]![language]!
        let line = bank[intent] ?? bank[.other]!
        let gesture: Gesture? = switch intent {
        case .greet: .wave
        case .happy, .praise: .cheer
        case .thanks: .clap
        case .sad, .question: .nod
        default: nil
        }
        return Reply(text: line.randomElement()!, gesture: gesture)
    }

    /// Understands both languages. ASCII keywords match whole words ("hi" must not fire on "this");
    /// CJK keywords match as substrings.
    private func classify(_ t: String) -> Intent {
        let s = t.lowercased()
        let tokens = Set(s.split { !$0.isLetter }.map(String.init))
        func has(_ words: [String]) -> Bool {
            words.contains { w in
                if w.contains(" ") || !w.allSatisfy(\.isASCII) { return s.contains(w) }
                return tokens.contains(w)
            }
        }
        if has(["再见", "晚安", "拜拜", "bye", "goodbye", "good night", "goodnight", "gn"]) { return .bye }
        if has(["你好", "嗨", "在吗", "早上好", "hi", "hello", "hey", "yo", "good morning"]) { return .greet }
        if has(["累", "难过", "伤心", "烦", "焦虑", "孤独", "哭", "不开心", "压力",
                "tired", "sad", "upset", "stressed", "anxious", "lonely", "cry", "exhausted", "down"]) { return .sad }
        if has(["开心", "高兴", "太棒", "哈哈", "好消息", "成功", "喜欢",
                "happy", "great", "awesome", "haha", "excited", "love", "good news", "yay"]) { return .happy }
        if has(["夸", "厉害", "可爱", "漂亮", "好看", "praise", "compliment", "cute", "pretty", "amazing"]) { return .praise }
        if has(["谢谢", "感谢", "多亏", "thanks", "thank", "thx"]) { return .thanks }
        if has(["笑话", "逗我", "搞笑", "joke", "funny", "make me laugh"]) { return .joke }
        if s.contains("?") || s.contains("？") || has(["吗", "什么", "为什么", "怎么", "what", "why", "how", "who", "where", "when"]) { return .question }
        return .other
    }

    private static let lines: [String: [Language: [Intent: [String]]]] = [
        "mint": [
            .zh: [
                .greet: ["你好呀～见到你真好。今天想聊点什么？", "嗨，我一直在等你呢。"],
                .sad: ["听起来你扛了很多事。先深呼吸一下，我在这里陪你，想说多少都可以。", "辛苦了。要不要跟我讲讲，是什么让你这么累？"],
                .happy: ["真好！看到你开心，我也跟着开心起来了。快多讲讲～", "这份好心情值得好好记住呢。"],
                .praise: ["被你这么说我会害羞的……不过你才是最值得被夸的那个人。"],
                .thanks: ["不用谢呀，能陪着你就是我最开心的事。"],
                .bye: ["好，晚安。今天也辛苦啦，明天见～"],
                .joke: ["为什么小云朵从不迷路？因为它总是跟着风走～是不是有点冷？"],
                .question: ["嗯……这是个好问题。你自己心里是怎么想的呢？我想先听听你的看法。"],
                .other: ["嗯嗯，我懂。然后呢？", "谢谢你愿意告诉我这些。", "我在听，你继续说。"],
            ],
            .en: [
                .greet: ["Hi~ it's so nice to see you. What's on your mind today?", "Hey, I've been waiting for you."],
                .sad: ["That sounds like a lot to carry. Take a deep breath, I'm right here. Say as much as you like.", "You've worked hard. Want to tell me what's wearing you out?"],
                .happy: ["That's wonderful! Your happiness is catching. Tell me more~", "A good mood like this deserves to be remembered."],
                .praise: ["You're making me blush... but you're the one who deserves the praise."],
                .thanks: ["You don't need to thank me. Being with you is my favorite thing."],
                .bye: ["Okay, good night. You did great today. See you tomorrow~"],
                .joke: ["Why do little clouds never get lost? They just follow the wind~ ...a bit cheesy, right?"],
                .question: ["Hmm... that's a good question. What do you think? I'd love to hear your view first."],
                .other: ["Mm-hm, I get it. And then?", "Thank you for telling me that.", "I'm listening. Keep going."],
            ],
        ],
        "neko": [
            .zh: [
                .greet: ["哟，来啦。", "嗯？你终于出现了，我都把歌单换了三轮了。"],
                .sad: ["啧，谁惹你了。过来，坐我旁边，耳机分你一半。", "累了就别硬撑。今晚什么都不用想，我给你放首慢的。"],
                .happy: ["哦？看你这表情就知道有好事。快说，别让我猜。", "不错嘛，今晚这首歌送你。"],
                .praise: ["哼，别夸我……再多夸两句也不是不行。"],
                .thanks: ["少来这套，朋友之间不说这个。"],
                .bye: ["去吧，晚安。梦里给你留了首歌。"],
                .joke: ["DJ 最怕什么？——掉线。……嗯，我也觉得不好笑。"],
                .question: ["问我？我觉得……先看你想要什么，答案自然就出来了。"],
                .other: ["嗯，继续。", "有意思，再多说点。", "我在听，不过眼睛还盯着混音台。"],
            ],
            .en: [
                .greet: ["Yo. You're here.", "Hm? Finally. I've gone through my playlist three times."],
                .sad: ["Tch, who got to you? Come sit by me, I'll share my earbuds.", "Don't tough it out. Think about nothing tonight, I'll play something slow."],
                .happy: ["Oh? That look says good news. Spill, don't make me guess.", "Not bad. This next track's for you."],
                .praise: ["Hmph, don't flatter me... okay, a couple more wouldn't hurt."],
                .thanks: ["Cut it out, friends don't say that."],
                .bye: ["Go on, good night. I left a song in your dreams."],
                .joke: ["What does a DJ fear most? Dropping out. ...Yeah, I don't think it's funny either."],
                .question: ["Asking me? I'd say... figure out what you want first, the answer follows."],
                .other: ["Mm, go on.", "Interesting, say more.", "I'm listening. Eyes are still on the mixer though."],
            ],
        ],
        "drummer": [
            .zh: [
                .greet: ["嗨嗨嗨！你来啦！我鼓棒都准备好了！", "哇，是你！今天也要元气满满哦！"],
                .sad: ["诶……别难过！来，跟着我的节奏深呼吸，咚——咚——咚咚！有我在呢！", "抱抱你！难受就说出来，说完我们一起把它打成碎片！"],
                .happy: ["太棒啦！！必须庆祝一下！来一段鼓点！", "耶！我就知道你可以的！"],
                .praise: ["嘿嘿，被夸了好开心！你也超级棒哦！"],
                .thanks: ["不客气不客气！你开心我就开心！"],
                .bye: ["晚安！明天继续一起加油！咚咚咚～"],
                .joke: ["鼓手为什么总爱敲桌子？因为……它没有鼓点就浑身难受！哈哈哈！"],
                .question: ["哇这个问题好难！不过别怕，我们一起想办法！你先说说你的想法？"],
                .other: ["对对对！然后然后？", "哇，好有意思，快多讲点！", "我听着呢，继续继续！"],
            ],
            .en: [
                .greet: ["Heyyy! You're here! My sticks are ready!", "Whoa, it's you! Let's bring the energy today too!"],
                .sad: ["Aw... don't be sad! Breathe with my beat, boom — boom — boom-boom! I've got you!", "Big hug! Let it out, then we'll smash it to pieces together!"],
                .happy: ["Awesome!! We have to celebrate! Drum break!", "Yay! I knew you could do it!"],
                .praise: ["Hehe, I'm so happy you said that! You're super awesome too!"],
                .thanks: ["Anytime, anytime! If you're happy, I'm happy!"],
                .bye: ["Good night! Let's go again tomorrow! Boom boom boom~"],
                .joke: ["Why do drummers keep tapping the table? Because without a beat they just can't stand it! Hahaha!"],
                .question: ["Whoa, that's a tough one! But don't worry, we'll figure it out together! What do you think?"],
                .other: ["Yeah yeah! And then?", "Wow, that's so interesting, tell me more!", "I'm listening, keep going!"],
            ],
        ],
        "explorer": [
            .zh: [
                .greet: ["嘿，伙伴！新的一天，新的地图已经展开了！", "你来得正好，我刚发现一条有趣的小路。"],
                .sad: ["嗯，这段路确实不好走。不过没关系，我们可以先在营地歇一歇，我陪着你。", "再长的夜路也会天亮。先说说看，是什么压得你喘不过气？"],
                .happy: ["太好了！这绝对值得在地图上插一面旗！", "哈哈，我就知道今天会有好事发生！"],
                .praise: ["谢啦！有你这样的队友，探险才有意思。"],
                .thanks: ["别客气，一起走的路才有意思。"],
                .bye: ["好，营地的篝火替你守着。晚安，明天继续出发！"],
                .joke: ["探险家最怕什么？——迷路。但我有你，所以不怕！"],
                .question: ["好问题！让我们像探险一样，先把线索一条条摆出来。你先说说看？"],
                .other: ["有意思，前面是不是还有故事？", "继续说，我记在探险笔记里了。", "哦哦，然后呢？"],
            ],
            .en: [
                .greet: ["Hey, partner! New day, new map unrolled!", "Perfect timing, I just found an interesting trail."],
                .sad: ["Yeah, this stretch is rough. That's okay, we can rest at camp for a bit. I'm with you.", "Even the longest night road ends at dawn. Tell me, what's weighing on you?"],
                .happy: ["Great news! That's worth planting a flag on the map!", "Ha, I knew something good would happen today!"],
                .praise: ["Thanks! Having a teammate like you makes the adventure worth it."],
                .thanks: ["No need. The road's better when we walk it together."],
                .bye: ["Okay, the campfire will keep watch. Good night, we set out again tomorrow!"],
                .joke: ["What does an explorer fear most? Getting lost. But I've got you, so I'm fine!"],
                .question: ["Good question! Let's lay out the clues one by one, like an expedition. You first?"],
                .other: ["Interesting, is there more to the story?", "Keep going, I'm writing it in my field notes.", "Ooh, and then?"],
            ],
        ],
        "blonde": [
            .zh: [
                .greet: ["你好呀，见到你真高兴。", "哎，你来了。我刚好在想你会不会出现。"],
                .sad: ["过来坐下。今天不需要坚强，只要告诉我发生了什么。", "我听出来了，你很累。慢慢说，我不打断你。"],
                .happy: ["我就知道！看你笑成这样，快说，别卖关子。", "太好了，这种好心情我们得好好庆祝一下。"],
                .praise: ["嘴真甜。不过……我收下了。"],
                .thanks: ["不客气，这是我的荣幸。"],
                .bye: ["晚安，好好休息。明天我还在这儿。"],
                .joke: ["我为什么从不迷路？因为我总是优雅地绕远路。"],
                .question: ["有意思的问题。你先说说，你自己倾向哪一边？"],
                .other: ["嗯，我明白。继续。", "有意思，再多告诉我一点。", "我在听。"],
            ],
            .en: [
                .greet: ["Hello, you. So glad to see you.", "Oh, there you are. I was just wondering if you'd show up."],
                .sad: ["Come sit. You don't have to be strong today, just tell me what happened.", "I can hear how tired you are. Take your time, I won't interrupt."],
                .happy: ["I knew it! Look at that smile. Out with it, don't keep me waiting.", "Wonderful. A mood like this deserves a proper celebration."],
                .praise: ["Aren't you sweet. ...I'll take it."],
                .thanks: ["Of course. It's my pleasure."],
                .bye: ["Good night, rest well. I'll be right here tomorrow."],
                .joke: ["Why do I never get lost? I just take the scenic route, elegantly."],
                .question: ["Interesting question. Tell me first, which way do you lean?"],
                .other: ["Mm, I see. Go on.", "Interesting, tell me a little more.", "I'm listening."],
            ],
        ],
        "cowgirl": [
            .zh: [
                .greet: ["嗨，伙计！今天风向不错。", "哟，来啦！我正愁没人说话。"],
                .sad: ["嘿，别垂头丧气的。坐下，咱们看看夕阳，你慢慢讲。", "这条路确实颠。不过马累了就歇歇，我陪你。"],
                .happy: ["哈！这才对味儿！今晚的篝火归你了。", "好消息跑得比我的马还快！快讲讲。"],
                .praise: ["哈哈，嘴挺甜。再夸，我可要脸红了。"],
                .thanks: ["自家人，客气啥。"],
                .bye: ["去吧，伙计。星星会替你守夜。"],
                .joke: ["我那匹马为啥不爱说话？因为它觉得我话够多了。"],
                .question: ["这问题……得喝口水慢慢想。你先说说你咋想的？"],
                .other: ["嗯哼，接着说。", "有意思，我听着呢。", "然后呢，伙计？"],
            ],
            .en: [
                .greet: ["Howdy, partner! Good wind today.", "Well look who's here! I was just short on company."],
                .sad: ["Hey now, chin up. Sit down, we'll watch the sunset and you take your time.", "That trail's rough, no doubt. Even a horse needs rest. I'm with you."],
                .happy: ["Ha! Now that's more like it! Tonight's campfire's all yours.", "Good news travels faster than my horse! Out with it."],
                .praise: ["Ha, smooth talker. Keep that up and I'll blush."],
                .thanks: ["Shucks, we're family. No need."],
                .bye: ["Ride on, partner. The stars'll keep watch."],
                .joke: ["Why's my horse so quiet? Reckons I do enough talking for both of us."],
                .question: ["That one needs a drink of water and some slow thinkin'. What's your take?"],
                .other: ["Uh-huh, go on.", "Interesting, I'm listening.", "And then, partner?"],
            ],
        ],
        "selfie": [
            .zh: [
                .greet: ["嘿！你来啦，我都准备好镜头了！", "哇，你入镜啦！来，笑一个！"],
                .sad: ["啊，别难过。来，凑近点，我们先做个鬼脸，然后你慢慢说。", "我在呢。想哭就哭，我帮你挡住镜头。"],
                .happy: ["耶！这个必须拍下来！快说发生了什么！", "笑得这么灿烂，这张我要设成封面！"],
                .praise: ["嘿嘿，被夸了！我今天上镜吗？"],
                .thanks: ["不客气，我们是一个画面里的人嘛。"],
                .bye: ["拜拜！明天记得再入镜哦！"],
                .joke: ["为什么自拍的人从不迷路？因为他们永远知道自己在哪个角度。"],
                .question: ["哇，好问题！我们换个角度想想，你怎么看？"],
                .other: ["嗯嗯，然后呢？", "有意思，再多说点！", "我在听，镜头对着你呢。"],
            ],
            .en: [
                .greet: ["Hey! You're here, my camera's ready!", "Whoa, you're in frame! Come on, smile!"],
                .sad: ["Aw, don't be sad. Come closer, let's pull a silly face first, then you tell me everything.", "I'm here. Cry if you want, I'll block the camera."],
                .happy: ["Yes! We have to capture this! Tell me what happened!", "That smile's so bright, it's going on the cover!"],
                .praise: ["Hehe, compliment received! Am I photogenic today?"],
                .thanks: ["Anytime, we're in the same frame after all."],
                .bye: ["Bye! Remember to step back into frame tomorrow!"],
                .joke: ["Why don't selfie people ever get lost? They always know their angle."],
                .question: ["Ooh, good question! Let's try another angle. What do you think?"],
                .other: ["Mm-hm, and then?", "Interesting, say more!", "I'm listening, the camera's on you."],
            ],
        ],
    ]
}

# Booth film: presentation cut with Thai voiceover

A second cut of the booth films (`film/isometric.html`, `film/hybrid.html`) with a Thai voiceover, for showing on stage and sending to customers. Status: planned, not started (decided 2026-10-19). The booth cut comes first: music and sound effects, no voice.

## Why a separate cut

- At the booth, people walk past in a few seconds in a loud hall. They cannot follow a sentence, and the on-screen headlines already carry the story.
- The booth film loops all day. A repeated voice wears on the staff; music does not.
- On stage or in a customer's inbox, people watch to the end with sound on. There, a voice adds meaning the screen alone does not.

## Where it plays

- A talk or a meeting room.
- Sent to customers by LINE, email or YouTube.

## How it differs from the booth cut

| | Booth | Presentation |
|---|---|---|
| Voice | None | Thai, one sentence per beat |
| Music | Full level, loops | Ducks under the voice, returns in the gaps |
| Playback | Seamless loop | Plays once, with its own start and end |
| End | Logo, then back to the first beat | Logo and closing line (and the booth QR, if `booth-qr-brochure.md` ships) |

The frames are the same film files. The presentation cut adds a second score with voice cues. If a line runs longer than its beat, lengthen the hold in that beat. Never speed up the voice.

## Voice

A calm, confident narrator, slower than the receipt film, pitched at executives. The narrator is not the assistant: the chat in the film already has the user speaking as "ผม", and a second first-person voice would blur who is talking.

## Script (draft)

Each line reuses the beat's on-screen headline, so the viewer hears the words they read.

| Beat | Headline on screen | Voiceover |
|---|---|---|
| 1 | หลายระบบ เหลือคำถามเดียว | หลายระบบในองค์กร เหลือแค่คำถามเดียว |
| 2 | ตรวจให้ ก่อนคุณตื่น | ตรวจให้ตั้งแต่เช้า ก่อนคุณตื่น |
| 3 | บอกครั้งเดียว จำตลอด | บอกครั้งเดียว จำไว้ตลอด |
| 4 | ไม่ใช่ข้อความยาว · ถามอะไร ได้ภาพที่ใช่ | ไม่ใช่ข้อความยาว ถามอะไร ได้ภาพที่ใช่ |
| 5 | ส่งต่อ ในคลิกเดียว | เจอเรื่องที่ต้องตาม ส่งต่อได้ในคลิกเดียว |
| 6 | แค่พิมพ์บอก | จะลางาน แค่พิมพ์บอก |
| 7 | เห็นเท่าที่สิทธิ์ให้ | แต่ละคน เห็นเท่าที่สิทธิ์ให้ |
| 8 | เชื่อมระบบใหม่ ได้ทันที | เชื่อมระบบใหม่ ใช้ได้ทันที |
| End | Winyu · ผู้ช่วย AI ของทุกคนในองค์กร | Winyu ผู้ช่วย AI ของทุกคนในองค์กร |

## Rules for the script

- Speak no numbers. Numbers stay on screen and come from `facts.json`; a spoken figure goes stale when the facts are rebuilt.
- One short sentence per beat. Relaxed Thai runs about 4–5 syllables a second, so a 4–5 s beat holds 15–20 syllables.
- "AI" is read เอไอ. The Thai reading of "Winyu" is not decided yet (see below).

## Steps

1. Lock the script with whoever owns the booth film.
2. Draft the voice with Thai TTS to time each line against its beat, and adjust the holds in the film if needed.
3. If the cut goes public, record a voice actor, one WAV file (48 kHz) per line, in `film/vo/`.
4. Add the lines to the presentation score as cues timed from the film's own timeline, the same way as the sound effects, with the music ducking under each line.
5. Render, run the same audio check as the booth cut, and listen on the speakers it will play on.

## Open decisions

1. How "Winyu" is read in Thai.
2. A voice actor for the final, or Thai TTS. TTS still mispronounces some words and sounds machine-made, which undercuts a premium product.
3. A male or a female voice.
4. Who hires the voice actor and keeps the usage rights.

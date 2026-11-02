# Japa Counter

**Chant. It counts.**

Japa Counter keeps count of your mantra for you, by listening. You sit in a dark room, close your eyes, and chant. The laptop quietly counts each repetition. When you reach your number, it rings three soft bells and stops.

No beads to hold, no buttons to press, no screen to look at.

---

## Why this exists

People who do japa often chant a mantra 108, 1,008 or even thousands of times in one sitting. Keeping count is the hard part:

- A mala (prayer beads) works, but your hand has to move with every repetition, and it's easy to lose your place.
- Clicker counters and phone apps need a tap every time, and that tap pulls you out of the moment.
- Counting in your head competes with the mantra itself.

What you really want is for someone else to keep count while you just chant. That's what this app does.

## What it's like to use

**1. Teach it your voice (once).**
You chant the mantra a few times into your laptop's microphone, once per recording. Each recording is short, and the app guides you through it:

- It counts down 3, 2, 1 while you stay quiet, so it can hear what your room sounds like.
- It says "Chant once now."
- It stops by itself when you go quiet.
- You listen back and choose **Keep** or **Redo**.

Three recordings are enough to start. Six to eight work best.

**2. Pick your number.**
Type any target, or tap **108** or **1008**.

**3. Press Start and chant.**
The screen goes black. After a moment of quiet, your mantra appears in the middle, large and warm. Underneath, small and dim, sit the count and the time:

```
           ॐ नमः शिवाय
        om namah shivaya


                     247 / 1008
                       18:40
```

You don't need to look at it. Chant at your own pace, one repetition rolling straight into the next. Every 108 chants a single soft bell rings, like reaching the end of a mala. When you reach your target, three bells ring and the session ends by itself, showing how long it took. Each session is saved in your history.

If you need to stop early, press Esc.

## What makes it different

- **It knows your voice, not "speech".** The app never tries to understand words. It compares what it hears with your own recordings of your own mantra. That's why it works with Sanskrit syllables that ordinary voice assistants don't recognise, and with any language or mantra.
- **It works when you chant without pauses.** Many people roll one repetition straight into the next with no breath in between. The app is built for that, not for neat gaps.
- **It would rather miss one than add one.** If it isn't sure, it doesn't count. You might occasionally chant one extra, but it should never say you're done when you're not.
- **Nothing to touch.** Once you press Start, you never need to touch the laptop again until the bells ring.
- **Your voice stays yours.** Listening and counting happen entirely inside your browser, on your laptop. No recording is sent to any company or server. The only place your voice samples go is your own Google Drive, and only if you switch that on.
- **Quiet by design.** A plain black screen, no animations, no beads or glowing rings. The mantra matters most; everything else whispers.

## Your recordings and Google Drive

Your voice samples are kept in your browser. If you connect Google Drive (optional), they're also saved as ordinary audio files in a folder called **Japa Counter/samples** in your Drive, so you can listen to them, download them, and get them back on another computer. The app can only see the files it created itself, nothing else in your Drive.

Counting sessions never use the internet. Once the app has loaded, it also works offline.

## What it can't do (yet)

- It needs your voice out loud. Silent, mental japa can't be heard by any microphone.
- It's built for a laptop with Chrome. There's no phone app.
- It has only been tested with computer-generated voices so far. The next step is tuning it with real recordings: a full 108-chant session counted against a physical mala, plus everyday room sounds like a fan, TV, talking, or dogs barking.
- Loud background noise right after you chant (a dog barking, for example) can keep a voice recording running. Press **Stop** when you're done, and **Redo** if you hear the noise at the end of the clip. ([#1](https://github.com/jatinnsharmaa/japa-counter/issues/1))

## Running it

You need [Node.js](https://nodejs.org) 22 or newer (it includes `npm`), [Git](https://git-scm.com), and Google Chrome. On a Mac, open the **Terminal** app to type the commands below.

**The first time**, in a terminal:

```bash
git clone https://github.com/jatinnsharmaa/japa-counter.git
cd japa-counter
npm install
```

**Every time you want to chant**, in a terminal:

```bash
cd japa-counter
npm run dev
```

If you cloned it somewhere else, `cd` into that folder instead.

Then open **http://localhost:5173** in Chrome. Always use this same address so Chrome remembers that you allowed the microphone, and your samples, settings and history are still there.

Leave the terminal window open while you use the app. When you're done, press **Ctrl + C** in the terminal to stop it.

Setup details, Google Drive configuration, how it works inside, and how it's tested are in **[SETUP.md](SETUP.md)**. The full design is in [docs/DESIGN.md](docs/DESIGN.md), and the decisions made while building it are in [docs/DECISIONS.md](docs/DECISIONS.md).

## How it works, in one paragraph

When you record a sample, the app turns your voice into a "fingerprint": fifty small snapshots per second describing the shape of the sound, not its loudness. During a session it makes the same fingerprint of whatever the microphone hears and keeps sliding your samples along it, looking for a stretch that matches. It allows for chanting faster or slower than your samples, but a different phrase, a cough or the TV doesn't fit. Each good match is one count.

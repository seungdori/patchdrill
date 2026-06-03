# PatchDrill launch GIF.
# Record with:  npm link && mkdir -p docs/media && vhs demo/patchdrill.tape && npm rm -g patchdrill
# (or drop `Require patchdrill` and use `node dist/cli.js ...` instead of `patchdrill ...`)
Output docs/media/patchdrill-demo.gif
Output docs/media/patchdrill-demo.mp4

Require patchdrill

Set Shell "bash"
Set FontSize 16
Set Width 1320
Set Height 1080
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set PlaybackSpeed 1.0

# Frame the threat: an AI agent opened a PR. What proof should exist before merge?
Type "# An AI agent opened a PR. What proof should exist before you merge it?"
Enter
Sleep 1300

Type "patchdrill demo --scenario risky-agent-pr --output out"
Sleep 500
Enter
Sleep 1000

# It ran offline, deterministically, with no model call.
Type "# offline  ·  deterministic  ·  no model call"
Enter
Sleep 1100

# The verdict — the frame people screenshot.
Type "cat out/patchdrill-demo-summary.md"
Sleep 400
Enter
Sleep 5000

Type "# FAIL 94/100  ·  2 critical  ·  a disabled test script  ·  same diff = same result, every time"
Enter
Sleep 2600

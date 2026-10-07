# Keyboard sound defaults

Replay recognizes named models using the bundled manufacturer-sourced database in
`src/utils/midiDeviceProfiles.ts`. No network request is needed when connecting a
keyboard. Each entry retains the official source URL for future verification.

Recognized digital pianos and sound-producing keyboards default to muting Replay's
audio for MIDI note presses. MIDI controllers and unknown devices default to app
sound. The “Keyboard has its own sound” switch overrides that default without
changing note feedback, recording, screen/computer keyboard audio, or playback.

Overrides are stored in `replay-midi-sound-overrides`, keyed by canonical model for
recognized devices and by manufacturer/name for unknown devices. Canonical model
keys survive reconnects, transport ID changes, and recognized name aliases.
Two keyboards of the same model share an override. Generic endpoint names such as
“Roland Digital Piano” cannot identify a specific model and remain unknown.

To extend coverage, add a verified model, exact name aliases, built-in sound flag,
and manufacturer source URL. Do not classify entire brands: the Akai MPK mini mk3
is a controller, whereas the MPK mini Play has its own sound. The flag describes
hardware capability; it cannot establish current volume or Local Control state.

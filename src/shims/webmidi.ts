// Shim for webmidi module - we don't need MIDI input functionality
export default {
  enable: () => Promise.resolve(),
  disable: () => {},
  inputs: [],
  outputs: [],
};

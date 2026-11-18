'use strict';
/* Every sound in Palm Coast Heat is synthesized with WebAudio: the engine
   hum that follows your speed, the two-tone siren, pickup and mission
   stings, the bust sting, and a slow synthwave loop behind the title.
   Nothing is loaded; there are no audio files. The context is created on
   the first user gesture, as browsers require. */

const AudioSys = (() => {
  let ctx = null, master = null, muted = false;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenLfo = null;
  let musicTimer = null, musicStep = 0;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
    return muted;
  }
  const isMuted = () => muted;

  // ---- engine ------------------------------------------------------------
  function engine(on, load, speedNorm) {
    if (!ctx) return;
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass'; engineFilter.frequency.value = 320;
      engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(master);
      engineOsc.start();
    }
    if (!engineOsc) return;
    if (!on) { engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08); return; }
    const rpm = 55 + speedNorm * 130 + load * 22;
    engineOsc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.05);
    engineFilter.frequency.setTargetAtTime(280 + speedNorm * 700, ctx.currentTime, 0.1);
    engineGain.gain.setTargetAtTime(0.05 + load * 0.05, ctx.currentTime, 0.09);
  }
  function stopEngine() {
    if (engineOsc) { try { engineOsc.stop(); } catch (e) {} engineOsc = null; }
  }

  // ---- siren ---------------------------------------------------------------
  function siren(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 720;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square'; sirenLfo.frequency.value = 0.65;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 130;
      sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0.0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start(); sirenLfo.start();
    }
    if (!sirenOsc) return;
    sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, ctx.currentTime, 0.15);
    if (!on && sirenOsc) {
      const o = sirenOsc, l = sirenLfo;
      setTimeout(() => { try { o.stop(); l.stop(); } catch (e) {} }, 500);
      sirenOsc = null; sirenLfo = null;
    }
  }

  // ---- one-shot stings ---------------------------------------------------------
  function tone(freq, t0, dur, type, vol, slideTo) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, ctx.currentTime + t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + t0 + dur);
    g.gain.setValueAtTime(vol || 0.12, ctx.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + dur);
    o.connect(g).connect(master);
    o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + dur + 0.02);
  }
  const pickup = () => { tone(660, 0, 0.09, 'square', 0.1); tone(990, 0.08, 0.12, 'square', 0.1); };
  const missionDone = () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.22, 'triangle', 0.14)); };
  const busted = () => { tone(392, 0, 0.2, 'sawtooth', 0.12); tone(311, 0.18, 0.24, 'sawtooth', 0.12); tone(233, 0.4, 0.4, 'sawtooth', 0.12); };
  const punch = () => { tone(140, 0, 0.08, 'square', 0.16, 60); };
  const door = () => { tone(220, 0, 0.07, 'square', 0.08); tone(330, 0.06, 0.07, 'square', 0.08); };

  // ---- title music: a slow minor-key synth loop ---------------------------------
  const CHORDS = [ [110, 220, 261.6, 329.6], [87.3, 174.6, 220, 261.6],
                   [98, 196, 246.9, 293.7], [130.8, 261.6, 329.6, 392] ];
  function music(on) {
    if (!ctx) return;
    if (on && !musicTimer) {
      musicStep = 0;
      musicTimer = setInterval(() => {
        if (!ctx || muted) return;
        const chord = CHORDS[Math.floor(musicStep / 2) % CHORDS.length];
        const note = chord[musicStep % chord.length];
        tone(note, 0, 0.42, 'triangle', 0.055);
        if (musicStep % 2 === 0) tone(chord[0] / 2, 0, 0.8, 'sine', 0.09);
        musicStep++;
      }, 210);
    } else if (!on && musicTimer) {
      clearInterval(musicTimer); musicTimer = null;
    }
  }

  return { unlock, setMuted, isMuted, engine, stopEngine, siren,
           pickup, missionDone, busted, punch, door, music };
})();

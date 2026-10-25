/* Foggy Bottom Whomp-Stompers — progressive enhancement only.
   Every page works with this file blocked; nothing here renders content. */

(() => {
  "use strict";

  /* --- Sticky header gets a solid background once you scroll off the hero --- */
  const header = document.querySelector(".site-header");
  if (header) {
    const setScrolled = () => {
      header.dataset.scrolled = String(window.scrollY > 24);
    };
    setScrolled();
    addEventListener("scroll", setScrolled, { passive: true });
  }

  /* --- Mobile nav --- */
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  if (toggle && nav) {
    const setOpen = (open) => {
      nav.dataset.open = String(open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    setOpen(false);

    toggle.addEventListener("click", () => {
      setOpen(nav.dataset.open !== "true");
    });

    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.dataset.open === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    // Close after tapping a link, and reset when we grow past the mobile breakpoint.
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    matchMedia("(min-width: 60rem)").addEventListener("change", (e) => {
      if (e.matches) setOpen(false);
    });
  }

  /* --- Photo carousel ---------------------------------------------------
     Crossfade with dots. Auto-advances, but pauses on hover, on focus,
     while the tab is hidden, and entirely under reduced-motion. Without
     this script the first slide simply stays put. */
  document.querySelectorAll(".carousel").forEach((root) => {
    const track = root.querySelector(".carousel__track");
    const slides = [...root.querySelectorAll(".carousel__slide")];
    const dots = [...root.querySelectorAll(".carousel__dot")];
    if (slides.length < 2) return;

    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let index = 0;
    let timer = null;

    const show = (next) => {
      index = (next + slides.length) % slides.length;
      slides.forEach((s, i) => (s.dataset.active = String(i === index)));
      dots.forEach((d, i) => d.setAttribute("aria-current", String(i === index)));
    };

    const stop = () => { clearInterval(timer); timer = null; };
    const play = () => {
      if (timer || reduce.matches || document.hidden) return;
      timer = setInterval(() => show(index + 1), 5200);
    };

    dots.forEach((dot, i) =>
      dot.addEventListener("click", () => { show(i); stop(); play(); })
    );

    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", play);
    root.addEventListener("focusin", stop);
    root.addEventListener("focusout", play);
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : play()));
    reduce.addEventListener("change", () => (reduce.matches ? stop() : play()));

    // Hand control to JS only now that it's wired up.
    track.dataset.ready = "true";
    root.dataset.enhanced = "true";
    show(0);
    play();
  });

  /* --- Video lightbox ---------------------------------------------------
     Clicking a thumbnail opens the embed large and centred in a native
     <dialog>, which gives us focus trapping, Esc-to-close and an inert
     background for free. The iframe is created on open and destroyed on
     close, so nothing keeps playing behind the scenes. */
  const lightbox = document.getElementById("video-lightbox");
  const videos = document.querySelectorAll(".video[data-video-id]");

  if (lightbox && videos.length && typeof lightbox.showModal === "function") {
    const frameHost = lightbox.querySelector(".lightbox__frame");
    const titleEl = lightbox.querySelector(".lightbox__title");
    const closeBtn = lightbox.querySelector(".lightbox__close");
    let opener = null;

    const open = (id, title, source) => {
      opener = source;
      titleEl.textContent = title;

      const frame = document.createElement("iframe");
      frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
      frame.title = title;
      frame.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      frame.allowFullscreen = true;
      frameHost.replaceChildren(frame);

      lightbox.showModal();
    };

    // Destroying the iframe is what actually stops playback.
    lightbox.addEventListener("close", () => {
      frameHost.replaceChildren();
      if (opener) { opener.focus(); opener = null; }
    });

    closeBtn.addEventListener("click", () => lightbox.close());

    // Click outside the panel closes it.
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) lightbox.close();
    });

    videos.forEach((el) =>
      el.addEventListener("click", () =>
        open(el.dataset.videoId, el.dataset.videoTitle || "Video", el)
      )
    );
  } else {
    /* No <dialog> support: fall back to playing in place, as before. */
    videos.forEach((el) =>
      el.addEventListener("click", () => {
        const frame = document.createElement("iframe");
        frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(el.dataset.videoId)}?autoplay=1&rel=0`;
        frame.title = el.dataset.videoTitle || "Video";
        frame.allow =
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        frame.allowFullscreen = true;
        el.replaceChildren(frame);
      }, { once: true })
    );
  }

  /* --- Song filter (repertoire) ----------------------------------------
     The input and count are hidden in the markup and revealed here, so
     without JS the visitor gets the full list rather than a dead control. */
  const filter = document.getElementById("song-filter");
  const songList = document.getElementById("song-list");
  const songCount = document.getElementById("song-count");

  if (filter && songList) {
    const songs = [...songList.children].map((li) => ({
      el: li,
      text: li.textContent.toLowerCase(),
    }));

    filter.hidden = false;
    if (songCount) songCount.hidden = false;

    const report = (shown) => {
      if (!songCount) return;
      songCount.textContent =
        shown === songs.length
          ? `${songs.length} songs`
          : `${shown} of ${songs.length} songs`;
    };

    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      let shown = 0;
      for (const song of songs) {
        const match = !q || song.text.includes(q);
        song.el.hidden = !match;
        if (match) shown++;
      }
      report(shown);
    });

    report(songs.length);
  }

  /* --- Band mixer (configurations) ------------------------------------
     One recording per instrument track, all from the same take, mixed live
     with the Web Audio API so every lineup plays in sync. Each track runs
     through its own gain node; switching an instrument in or out, or
     soloing it, only ramps that gain, so nothing ever has to re-sync.

     Nothing downloads until the first press of play: then every track is
     fetched and decoded, because Web Audio needs the whole clip in memory
     to start the tracks together. Desktops get the full song (~25 MB);
     touch devices get a 75-second excerpt (~7 MB). mix.json, fetched up
     front, is small: the waveforms, the length, and the master level.

     Each [data-min] group keeps at least that many players switched on:
     one string, one bass, two horns. Solo is for listening only; it
     overrides the lineup without changing it. Without this script the
     markup is a plain list of <audio> players. */
  const SIZES = ["", "Solo", "Duo", "Trio", "Quartet", "Quintet", "Sextet",
    "Septet", "Octet", "Nonet", "Tentet"];
  const AudioCtx = window.AudioContext || window.webkitAudioContext;

  document.querySelectorAll("[data-mixer]").forEach((root) => {
    if (!AudioCtx || !window.fetch) return;

    // Every track is held decoded in memory at once: the full song is ~400 MB,
    // fine on a desktop and enough to crash a phone, which gets the excerpt.
    const conn = navigator.connection || {};
    const small =
      matchMedia("(pointer: coarse)").matches ||
      (navigator.deviceMemory && navigator.deviceMemory < 4) ||
      conn.saveData;
    const mixUrl = (small && root.dataset.mixSmall) || root.dataset.mix;
    const base = mixUrl.replace(/[^/]*$/, "");
    const tracks = [...root.querySelectorAll(".mixer__track")].map((el) => ({
      el,
      id: el.dataset.track,
      players: el.dataset.players.split(/\s+/),
      on: el.querySelector(".mixer__chip").getAttribute("aria-pressed") === "true",
      solo: false,
      chip: el.querySelector(".mixer__chip"),
      soloBtn: el.querySelector(".mixer__solo"),
      canvas: el.querySelector(".mixer__wave"),
      wave: [],
      buffer: null,
      gain: null,
      source: null,
    }));
    const groups = [...root.querySelectorAll("[data-min]")].map((el) => ({
      min: Number(el.dataset.min),
      need: el.dataset.need,
      tracks: tracks.filter((t) => el.contains(t.el)),
    }));
    const overlays = [...root.querySelectorAll(".mixer__off[data-player]")];
    const stage = root.querySelector(".mixer__stage");
    const playBtn = root.querySelector(".mixer__play");
    const seek = root.querySelector(".mixer__seek");
    const elapsed = root.querySelector(".mixer__time");
    const total = root.querySelector(".mixer__duration");
    const size = root.querySelector(".mixer__size");
    const note = root.querySelector(".mixer__note");

    let duration = 0;
    let master = 1;          // linear gain that keeps the whole band from clipping
    let ctx = null;
    let out = null;
    let loading = null;      // promise, once the download has begun
    let playing = false;     // the visitor wants sound
    let started = 0;         // ctx time at which position 0 would have played
    let paused = 0;          // position while stopped
    let message = "";

    const clock = (s) => {
      if (!isFinite(s) || s < 0) return "–:––";
      s = Math.floor(s);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    const position = () =>
      playing && ctx && tracks[0].source ? Math.min(duration, ctx.currentTime - started) : paused;
    const anySolo = () => tracks.some((t) => t.solo);
    const audible = (t) => (anySolo() ? t.solo : t.on);
    const playerOn = (p) => tracks.some((t) => t.on && t.players.includes(p));

    /* --- drawing --- */
    const styles = getComputedStyle(root);
    const draw = (t) => {
      const c = t.canvas;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h || !t.wave.length) return;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const g = c.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const played = duration ? (position() / duration) * w : 0;
      const on = audible(t);
      const bar = 2;
      const step = 3;
      const n = Math.floor(w / step);
      for (let i = 0; i < n; i++) {
        const v = t.wave[Math.floor((i / n) * t.wave.length)] / 100;
        const bh = Math.max(1, v * h);
        const x = i * step;
        g.fillStyle = styles.getPropertyValue(
          !on ? "--wave-off" : x < played ? "--wave-played" : "--wave-on"
        );
        g.fillRect(x, (h - bh) / 2, bar, bh);
      }
    };
    const drawAll = () => tracks.forEach(draw);

    let frame = 0;
    const tick = () => {
      const pos = position();
      if (playing && pos >= duration && duration) {
        // Reached the end of the excerpt.
        stopSources();
        playing = false;
        paused = 0;
        render();
      }
      elapsed.textContent = clock(position());
      if (document.activeElement !== seek) seek.value = String(position());
      drawAll();
      frame = playing ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => { if (!frame) frame = requestAnimationFrame(tick); };

    /* --- state -> page --- */
    const render = () => {
      for (const t of tracks) {
        t.chip.setAttribute("aria-pressed", String(t.on));
        t.soloBtn.setAttribute("aria-pressed", String(t.solo));
        t.el.dataset.audible = String(audible(t));
        if (t.gain && ctx) t.gain.gain.setTargetAtTime(audible(t) ? 1 : 0, ctx.currentTime, 0.015);
      }
      for (const img of overlays) img.dataset.visible = String(!playerOn(img.dataset.player));
      const count = tracks.reduce((n, t) => n + (t.on ? t.players.length : 0), 0);
      size.textContent = SIZES[count] || `${count}-piece band`;
      const soloed = tracks.filter((t) => t.solo).map((t) => t.chip.textContent.trim());
      note.textContent =
        message || (soloed.length ? `Solo: ${soloed.join(", ")}. Turn solo off to hear the lineup.` : "");
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
      root.dataset.playing = String(playing);
      root.dataset.solo = String(soloed.length > 0);
      drawAll();
    };

    /* --- audio --- */
    const load = () =>
      (loading ||= (async () => {
        let done = 0;
        message = `Loading the band… 0 of ${tracks.length}`;
        render();
        await Promise.all(
          tracks.map(async (t) => {
            const res = await fetch(`${base}${t.id}.mp3`);
            if (!res.ok) throw new Error(`${t.id}: ${res.status}`);
            const data = await res.arrayBuffer();
            t.buffer = await new Promise((ok, fail) => ctx.decodeAudioData(data, ok, fail));
            t.gain = ctx.createGain();
            t.gain.gain.value = audible(t) ? 1 : 0;
            t.gain.connect(out);
            message = `Loading the band… ${++done} of ${tracks.length}`;
            render();
          })
        );
        message = "";
      })());

    const stopSources = () => {
      for (const t of tracks) {
        if (!t.source) continue;
        t.source.onended = null;
        try { t.source.stop(); } catch {}
        t.source.disconnect();
        t.source = null;
      }
    };

    // Every track starts on the same scheduled instant: that is what keeps
    // them in sync, to the sample.
    const startSources = (from) => {
      stopSources();
      const at = ctx.currentTime + 0.05;
      for (const t of tracks) {
        t.source = ctx.createBufferSource();
        t.source.buffer = t.buffer;
        t.source.connect(t.gain);
        t.source.start(at, from);
      }
      started = at - from;
    };

    const play = async () => {
      if (!ctx) {
        ctx = new AudioCtx();
        out = ctx.createGain();
        out.gain.value = master;
        out.connect(ctx.destination);
        // iOS: let the mixer play with the ringer switch off, like a video would.
        try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
      }
      ctx.resume();
      try {
        await load();
      } catch {
        loading = null;
        playing = false;
        message = "The recordings didn’t load. Check your connection and press play again.";
        render();
        return;
      }
      if (!playing) return;   // paused while it was loading
      startSources(paused >= duration ? 0 : paused);
      render();
      kick();
    };

    const pause = () => {
      paused = position();
      stopSources();
      render();
    };

    const seekTo = (s) => {
      paused = Math.max(0, Math.min(duration, s));
      if (playing && tracks[0].source) startSources(paused);
      elapsed.textContent = clock(paused);
      drawAll();
    };

    /* --- controls --- */
    const toggle = (t) => {
      message = "";
      if (t.on) {
        const group = groups.find((g) => g.tracks.includes(t));
        if (group) {
          const left = group.tracks.reduce((n, o) => n + (o.on && o !== t ? o.players.length : 0), 0);
          if (left < group.min) {
            message = `A lineup needs at least ${group.need}.`;
            render();
            return;
          }
        }
      }
      t.on = !t.on;
      render();
    };

    for (const t of tracks) {
      t.chip.addEventListener("click", () => toggle(t));
      t.soloBtn.addEventListener("click", () => {
        message = "";
        t.solo = !t.solo;
        render();
      });
      // Click or drag on any waveform to move through the tune.
      const scrub = (e) => {
        const r = t.canvas.getBoundingClientRect();
        seekTo(((e.clientX - r.left) / r.width) * duration);
      };
      t.canvas.addEventListener("pointerdown", (e) => {
        if (!duration) return;
        t.canvas.setPointerCapture(e.pointerId);
        scrub(e);
        t.canvas.onpointermove = scrub;
      });
      t.canvas.addEventListener("pointerup", () => (t.canvas.onpointermove = null));
    }
    // Tapping the art. Each overlay's alpha is exactly that player's shape
    // (the pixels the grayed export changed), so it doubles as a
    // pixel-accurate hit map, whether or not the overlay is showing.
    const hitMaps = new Map();
    const alphaOf = (img) => {
      if (hitMaps.has(img)) return hitMaps.get(img);
      if (!img.complete || !img.naturalWidth) return null;
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      let data = null;
      try { data = g.getImageData(0, 0, c.width, c.height).data; } catch {}
      hitMaps.set(img, data);
      return data;
    };
    const playerAt = (e) => {
      for (const img of overlays) {
        const r = img.getBoundingClientRect();
        const x = Math.floor(((e.clientX - r.left) / r.width) * img.naturalWidth);
        const y = Math.floor(((e.clientY - r.top) / r.height) * img.naturalHeight);
        if (x < 0 || y < 0 || x >= img.naturalWidth || y >= img.naturalHeight) continue;
        const a = alphaOf(img);
        if (a && a[(y * img.naturalWidth + x) * 4 + 3] > 127) return img;
      }
      return null;
    };
    const trackOf = (img) => img && tracks.find((t) => t.players.includes(img.dataset.player));
    let hovered = null;
    const hover = (img) => {
      if (img === hovered) return;
      if (hovered) delete hovered.dataset.hover;
      hovered = img;
      if (img) img.dataset.hover = "true";
      stage.style.cursor = trackOf(img) ? "pointer" : "";
    };
    stage.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") hover(playerAt(e));
    });
    stage.addEventListener("pointerleave", () => hover(null));
    stage.addEventListener("click", (e) => {
      const t = trackOf(playerAt(e));
      if (t) toggle(t);
    });

    playBtn.addEventListener("click", () => {
      if (playing) {
        pause();          // reads the position, so before playing flips
        playing = false;
      } else {
        playing = true;
        play();
      }
      render();
    });

    seek.addEventListener("input", () => seekTo(Number(seek.value)));

    addEventListener("resize", drawAll);

    fetch(mixUrl)
      .then((r) => r.json())
      .then((mix) => {
        duration = mix.duration;
        master = Math.pow(10, mix.gainDb / 20);
        for (const t of tracks) t.wave = mix.waves[t.id] || [];
        seek.max = String(duration);
        total.textContent = clock(duration);
        root.querySelector(".mixer__tracks").hidden = true;
        root.querySelector(".mixer__builder").hidden = false;
        root.querySelector(".mixer__deck").hidden = false;
        root.dataset.ready = "true";
        render();
      })
      .catch(() => {});   // leave the plain track list in place
  });

  /* --- Ambient background video ---------------------------------------
     Decorative only, so it has to earn its bandwidth. We skip the embed
     entirely when it would be wasteful or unwanted, and the poster image
     underneath carries the section on its own in every skipped case. */
  const bg = document.querySelector("[data-bg-video]");
  if (bg) {
    const conn = navigator.connection || {};
    const skip =
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      matchMedia("(max-width: 48rem)").matches ||   // phones: poster only
      matchMedia("(hover: none)").matches ||        // touch: autoplay is unreliable
      conn.saveData === true ||
      /^(slow-2g|2g)$/.test(conn.effectiveType || "");

    if (!skip && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((en) => en.isIntersecting)) return;
          io.disconnect();

          const id = bg.dataset.bgVideo;
          const start = bg.dataset.bgStart || "0";
          const params = new URLSearchParams({
            autoplay: "1",
            mute: "1",
            controls: "0",
            loop: "1",
            playlist: id,        // required for loop=1 on a single video
            start: start,
            playsinline: "1",
            disablekb: "1",
            modestbranding: "1",
            rel: "0",
            iv_load_policy: "3",
          });

          const frame = document.createElement("iframe");
          frame.src = `https://www.youtube-nocookie.com/embed/${id}?${params}`;
          frame.title = "";
          frame.tabIndex = -1;
          frame.setAttribute("aria-hidden", "true");
          frame.allow = "autoplay; encrypted-media";
          frame.addEventListener("load", () => {
            bg.dataset.videoReady = "true";
          });
          bg.append(frame);
        },
        { rootMargin: "200px" }
      );
      io.observe(bg);
    }
  }

  /* --- Booking form: don't pay for Google's iframe until it's in view --- */
  const formHost = document.querySelector("[data-embed-src]");
  if (formHost) {
    const load = () => {
      const frame = document.createElement("iframe");
      frame.src = formHost.dataset.embedSrc;
      frame.title = formHost.dataset.embedTitle || "Booking form";
      frame.loading = "lazy";
      frame.style.width = "100%";
      frame.style.minHeight = "1100px";
      frame.style.border = "0";
      formHost.replaceChildren(frame);
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((en) => en.isIntersecting)) {
            io.disconnect();
            load();
          }
        },
        { rootMargin: "400px" }
      );
      io.observe(formHost);
    } else {
      load();
    }
  }
})();

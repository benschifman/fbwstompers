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
     Several recordings of the same take, each with a different lineup.
     Tapping a player switches to the recording with exactly that player
     added or removed, at the same point in the song. Without this script
     the markup is a plain list of <audio> players.

     Switching: the incoming track starts muted (muted works on iOS, where
     volume is read-only), is nudged until it lines up with the outgoing
     one, then crossfades in — or cuts in where volume can't be set. */
  document.querySelectorAll("[data-mixer]").forEach((root) => {
    const mixes = [...root.querySelectorAll("audio[data-players]")].map((el) => ({
      el,
      players: new Set(el.dataset.players.split(/\s+/)),
      label: el.dataset.label || "",
    }));
    if (mixes.length < 2) return;

    const toggles = [...root.querySelectorAll("button[data-player]")];
    const presets = [...root.querySelectorAll("button[data-preset]")].map((el) => ({
      el,
      players: new Set(el.dataset.players.split(/\s+/)),
    }));
    const overlays = [...root.querySelectorAll(".mixer__off[data-player]")];
    const playBtn = root.querySelector(".mixer__play");
    const seek = root.querySelector(".mixer__seek");
    const elapsed = root.querySelector(".mixer__time");
    const total = root.querySelector(".mixer__duration");
    const now = root.querySelector(".mixer__now");

    let current = mixes[0];   // the lineup selected
    let live = null;          // the mix actually sounding, null when stopped
    let playing = false;
    let position = 0;
    let seq = 0;              // bumped by every action; stale async work checks it

    const probe = new Audio();
    probe.volume = 0.5;
    const canFade = probe.volume === 0.5;

    const same = (a, b) => a.size === b.size && [...a].every((p) => b.has(p));
    const toggled = (key) => {
      const want = new Set(current.players);
      if (!want.delete(key)) want.add(key);
      return mixes.find((m) => same(m.players, want));
    };
    const clock = (s) => {
      if (!isFinite(s)) return "–:––";
      s = Math.floor(s);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    const once = (el, type) =>
      new Promise((res) => el.addEventListener(type, res, { once: true }));
    // play() and "seeked" both resolve before the playhead is reliably
    // moving, and it can stall again just after. Only a playhead that has
    // run a good stretch past where it was is worth measuring drift against.
    const steady = (el) =>
      new Promise((res) => {
        const from = el.currentTime;
        const t0 = performance.now();
        const id = setInterval(() => {
          if (el.currentTime - from > 0.2 || performance.now() - t0 > 2000) {
            clearInterval(id);
            res();
          }
        }, 8);
      });

    const render = () => {
      for (const b of toggles) {
        const key = b.dataset.player;
        b.setAttribute("aria-pressed", String(current.players.has(key)));
        b.disabled = !toggled(key);
      }
      for (const p of presets) {
        const mix = mixes.find((m) => same(m.players, p.players));
        p.el.disabled = !mix;
        p.el.title = mix ? "" : "No recording of this lineup yet";
        p.el.setAttribute("aria-pressed", String(mix === current));
      }
      for (const img of overlays) {
        img.dataset.visible = String(!current.players.has(img.dataset.player));
      }
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
      root.dataset.playing = String(playing);
      if (now) now.textContent = `Now: ${current.label}`;
    };

    const showTime = () => {
      elapsed.textContent = clock(position);
      if (document.activeElement !== seek) seek.value = String(position);
    };

    // Everything but the sounding mix stops, at full volume for next time.
    const settle = () => {
      for (const m of mixes) {
        m.el.volume = 1;
        m.el.muted = false;
        if (m !== live) m.el.pause();
      }
    };

    const fade = (from, to, ms, token) =>
      new Promise((res) => {
        const t0 = performance.now();
        const id = setInterval(() => {
          let k = Math.min(1, (performance.now() - t0) / ms);
          if (token !== seq) k = 1;
          from.volume = 1 - k;
          to.volume = k;
          if (k === 1) { clearInterval(id); res(); }
        }, 16);
      });

    const start = () => {
      const token = ++seq;
      live = current;
      settle();
      current.el.currentTime = position;
      current.el.play().catch(() => {
        if (token !== seq) return;
        playing = false;
        live = null;
        render();
      });
    };

    const stop = () => {
      ++seq;
      if (live) position = live.el.currentTime;
      live = null;
      settle();
    };

    // Called synchronously from the click, so play() keeps the user gesture.
    // How far ahead to aim a seek so the track is in step once it is
    // actually moving again. Learned from each correction and kept, so after
    // the first switch most land in one go.
    let lead = 0;

    // Called synchronously from the click, so play() keeps the user gesture.
    const swap = (from, to) => {
      const token = ++seq;
      // Silence it with volume where we can: Chrome stalls an element for a
      // few tens of ms when it is unmuted, which would undo the alignment.
      if (canFade) to.el.volume = 0;
      else to.el.muted = true;
      to.el.currentTime = from.el.currentTime + lead;
      const begun = to.el.play();
      (async () => {
        try { await begun; } catch { return; }
        await steady(to.el);
        for (let i = 0; i < 4 && token === seq; i++) {
          const drift = from.el.currentTime - to.el.currentTime;
          if (Math.abs(drift) < 0.015) break;
          lead = Math.min(0.5, Math.max(0, lead + drift));
          to.el.currentTime = from.el.currentTime + lead;
          await once(to.el, "seeked");
          await steady(to.el);
        }
        if (token !== seq) return;
        live = to;
        if (canFade) await fade(from.el, to.el, 160, token);
        else to.el.muted = false;
        if (token !== seq) return;
        settle();
      })();
    };

    const choose = (next) => {
      if (!next || next === current) return;
      current = next;
      if (playing && live && live !== current) swap(live, current);
      else if (playing && live === current) { ++seq; settle(); }
      render();
    };

    for (const m of mixes) {
      m.el.controls = false;
      m.el.addEventListener("loadedmetadata", () => {
        seek.max = String(m.el.duration);
        total.textContent = clock(m.el.duration);
      });
      m.el.addEventListener("timeupdate", () => {
        if (m !== live) return;
        position = m.el.currentTime;
        showTime();
      });
      m.el.addEventListener("ended", () => {
        if (m !== live) return;
        playing = false;
        live = null;
        position = 0;
        settle();
        showTime();
        render();
      });
      // Paused from outside the page — headphones, lock screen.
      m.el.addEventListener("pause", () => {
        if (m !== live || !playing || m.el.ended) return;
        playing = false;
        stop();
        render();
      });
    }
    if (mixes[0].el.readyState >= 1) {
      seek.max = String(mixes[0].el.duration);
      total.textContent = clock(mixes[0].el.duration);
    }

    playBtn.addEventListener("click", () => {
      playing = !playing;
      if (playing) start();
      else stop();
      render();
    });

    seek.addEventListener("input", () => {
      position = Number(seek.value);
      elapsed.textContent = clock(position);
      if (live) live.el.currentTime = position;
    });

    for (const b of toggles) {
      b.addEventListener("click", () => choose(toggled(b.dataset.player)));
    }
    for (const p of presets) {
      p.el.addEventListener("click", () =>
        choose(mixes.find((m) => same(m.players, p.players)))
      );
    }

    root.querySelector(".mixer__tracks").hidden = true;
    root.querySelector(".mixer__deck").hidden = false;
    root.querySelector(".mixer__players").hidden = false;
    const lineups = root.querySelector(".mixer__lineups");
    if (lineups) lineups.hidden = false;
    root.querySelectorAll(".mixer__hotspot").forEach((h) => (h.hidden = false));
    root.dataset.ready = "true";
    render();
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

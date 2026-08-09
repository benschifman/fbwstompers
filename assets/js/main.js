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

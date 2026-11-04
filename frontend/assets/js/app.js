/* ==========================================================================
   Victor Odjesawha — front-end behaviour
   Chat widget, forms, search, logo theming and small interaction polish.
   ========================================================================== */
(function () {
  "use strict";

  var ACCENT = "#a45a3d";
  var CONTACT_EMAIL = "victorodjes@gmail.com";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function postJSON(url, payload) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload || {}),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
        return data;
      });
    });
  }

  /* ----------------------------------------------------------------------
     Logo: swap to the light variant when dark mode is active
     ---------------------------------------------------------------------- */
  var LOGO_LIGHT = "/assets/brand/logo.svg";
  var LOGO_DARK = "/assets/brand/logo-inverse.svg";

  function syncLogo() {
    var dark = document.body.classList.contains("dark-skin");
    document.querySelectorAll('img.vo-logo, .header img[src*="/assets/brand/logo"]').forEach(function (img) {
      var wanted = dark ? LOGO_DARK : LOGO_LIGHT;
      if (img.getAttribute("src") !== wanted) {
        img.setAttribute("src", wanted);
        img.removeAttribute("srcset");
      }
    });
  }

  ready(function () {
    /* Mark every header logo so the CSS can size it consistently */
    document.querySelectorAll(".header img").forEach(function (img) {
      if (/logo/i.test(img.getAttribute("src") || "")) img.classList.add("vo-logo");
    });
    syncLogo();
    new MutationObserver(syncLogo).observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    /* Defer off-screen images */
    var imgs = Array.prototype.slice.call(document.querySelectorAll("img"));
    imgs.forEach(function (img, i) {
      if (i > 4 && !img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
    });

    /* Back to top -------------------------------------------------------- */
    var toTop = document.createElement("button");
    toTop.type = "button";
    toTop.className = "vo-to-top";
    toTop.setAttribute("aria-label", "Back to top");
    toTop.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    document.body.appendChild(toTop);
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    var onScroll = function () {
      toTop.classList.toggle("is-visible", window.scrollY > 700);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    initChat();
    initWhatsApp();
    initContactForms();
    initSearchPage();
    initComments();
    initLightboxes();
    initVideos();
  });

  /* ----------------------------------------------------------------------
     Portfolio lightbox and hero video
     ---------------------------------------------------------------------- */
  function initLightboxes() {
    var $ = window.jQuery;
    if (!$ || !$.fn.magnificPopup) return;
    $("a.has-popup-image").magnificPopup({
      type: "image",
      gallery: { enabled: true, navigateByImgClick: true, preload: [0, 1] },
      removalDelay: 160,
      mainClass: "mfp-fade",
      fixedContentPos: false,
      closeOnContentClick: true,
      image: {
        titleSrc: function (item) {
          return item.el.find("img").attr("alt") || "";
        },
      },
    });
  }

  function initVideos() {
    var $ = window.jQuery;
    if (!$) return;
    $(".m-video-large .video").each(function () {
      var $video = $(this);
      var $frame = $video.find(".js-video-iframe");
      $video.find(".play, .img").on("click", function () {
        var src = $frame.attr("data-src");
        if (src && !$frame.attr("src")) $frame.attr("src", src);
        $video.addClass("active");
        return false;
      });
    });
  }

  /* ======================================================================
     Draggable WhatsApp button
     ====================================================================== */
  function initWhatsApp() {
    var el = document.querySelector(".vo-wa");
    if (!el || el.dataset.dragReady) return;
    el.dataset.dragReady = "1";

    var KEY = "vo-wa-pos";
    var dragging = false;
    var moved = false;
    var startX = 0;
    var startY = 0;
    var originX = 0;
    var originY = 0;

    function clamp(x, y) {
      var w = el.offsetWidth || 56;
      var h = el.offsetHeight || 56;
      var maxX = window.innerWidth - w - 10;
      var maxY = window.innerHeight - h - 10;
      return {
        x: Math.min(Math.max(10, x), Math.max(10, maxX)),
        y: Math.min(Math.max(10, y), Math.max(10, maxY)),
      };
    }

    function place(x, y) {
      var p = clamp(x, y);
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
      return p;
    }

    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (err) { saved = null; }
    if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
      var start = place(saved.x, saved.y);
      saved = start;
    }

    el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      var rect = el.getBoundingClientRect();
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      originX = rect.left;
      originY = rect.top;
      el.classList.add("is-dragging");
      if (el.setPointerCapture) {
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
      }
    });

    el.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      moved = true;
      el.dataset.drag = "true";
      place(originX + dx, originY + dy);
    });

    function stop(e) {
      if (!dragging) return;
      dragging = false;
      el.classList.remove("is-dragging");
      if (moved) {
        var rect = el.getBoundingClientRect();
        try {
          localStorage.setItem(KEY, JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
        } catch (err) {}
        // Let the pointerup finish, then decide whether the click was a drag.
        setTimeout(function () { el.dataset.drag = "false"; }, 0);
      }
    }
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);

    el.addEventListener("click", function (e) {
      if (moved || el.dataset.drag === "true") {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    });

    window.addEventListener("resize", function () {
      if (!el.style.left) return;
      var rect = el.getBoundingClientRect();
      var p = place(rect.left, rect.top);
      try {
        localStorage.setItem(KEY, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) }));
      } catch (err) {}
    });
  }

  /* ======================================================================
     AI chat widget
     ====================================================================== */
  var CHAT_OPENERS = [
    "What does Victor do?",
    "See recent work",
    "What does he charge?",
  ];

  var CHAT_KB = [
    {
      re: /(price|pricing|cost|rate|fee|budget|retainer|day rate|charge)/i,
      a: "Victor works on three packages:\n\n• SEO & Website Setup — $150 one-off\n• Social Media Growth — $250/month\n• Full Digital Marketing Partner — $400/month\n\nEach one starts with a short call to confirm fit and scope. You can send a brief through the contact form at the bottom of the home page.",
    },
    {
      re: /(service|what.*do|help|offer|consult|growth|marketing)/i,
      a: "Victor is a Lagos-based digital marketing manager. He handles SEO, Google and Meta Ads, social media management, content and video production, email marketing, web builds on WordPress and Shopify, and GA4 reporting.\n\nMost clients start with one channel and expand once the numbers make sense.",
    },
    {
      re: /(experience|background|cv|resume|worked|career|years)/i,
      a: "4+ years in digital marketing across oil and gas, fashion, nonprofit, hospitality and agency work. Current and recent roles include TMA Brand Consulting, Virtual Tribe, Cute-Saint, Offshore Dimensions, Blossomflow Foundation and IdeaToSites.\n\nYou can download the full CV from the hero section.",
    },
    {
      re: /(result|case|portfolio|work|project|client)/i,
      a: "Recent work includes a 639K+ reach campaign for TravnaTours, 54.4K seven-day discovery and 137.2% dashboard growth for ChinChilli, a ₦50,000 Meta giveaway that landed at ₦7.12 per result, and SEO plus e-commerce fixes for Offshore Dimensions.\n\nSee the Works section for the case studies.",
    },
    {
      re: /(contact|email|call|book|meeting|hire|available|availability|start)/i,
      a: "Victor is available for new projects.\n\nEmail: " + CONTACT_EMAIL + "\nPhone: +234 814 510 9030\nLinkedIn: linkedin.com/in/victorod\nWhatsApp: wa.me/2348145109030\n\nOr use the contact form at the bottom of the home page — he usually replies within one business day.",
    },
    {
      re: /(seo|content|organic|keyword)/i,
      a: "SEO is a core part of the work: technical audits, keyword research, on-page fixes, internal linking and content that matches real search intent. Recent examples include technical SEO for Offshore Dimensions and the TMA Brand Consulting client sites.",
    },
    {
      re: /(paid|ppc|ads|google ads|meta|instagram|facebook|media)/i,
      a: "Paid media covers Google Search, Facebook and Instagram: audience research, creative briefs, A/B testing, budget pacing and reporting tied to cost per result. Recent campaigns include a ₦50,000 Meta giveaway that finished at ₦7.12 per result.",
    },
    {
      re: /(social|instagram|tiktok|facebook|community)/i,
      a: "Social media work spans strategy, content calendars, short-form video, community management and reporting. At Cute-Saint he grew organic reach for a Lagos fashion brand; at Virtual Tribe he built brand guidelines and content systems for U.S. hospitality clients.",
    },
    {
      re: /(analytic|ga4|data|dashboard|report|conversion|email)/i,
      a: "Analytics and email: GA4 setup, event tracking, campaign tagging and plain-English monthly reports, plus newsletter and lifecycle campaigns. At Blossomflow Foundation this included monitoring donation-page performance and donor engagement.",
    },
    {
      re: /(hi|hello|hey|good morning|good afternoon|who are you)/i,
      a: "Hi! I'm Victor's AI assistant. I can help with his services, experience, recent results, pricing or availability. What would you like to know?",
    },
    {
      re: /(thanks|thank you|cheers|great|nice)/i,
      a: "Happy to help. If you'd like a human reply, drop a note through the contact form or email " + CONTACT_EMAIL + ".",
    },
  ];

  function localAnswer(message) {
    var text = String(message || "");
    for (var i = 0; i < CHAT_KB.length; i++) {
      if (CHAT_KB[i].re.test(text)) return CHAT_KB[i].a;
    }
    return "Good question. I know most about Victor's services, experience, results, pricing and availability. Try asking one of those — or send the question through the contact form and Victor will reply personally.";
  }

  function initChat() {
    if (document.getElementById("vo-chat")) return;

    var root = document.createElement("div");
    root.id = "vo-chat";
    root.className = "vo-chat";
    root.innerHTML =
      '<button type="button" class="vo-chat__toggle" aria-expanded="false" aria-controls="vo-chat-panel">' +
        '<span class="vo-chat__pulse" aria-hidden="true"></span>' +
        '<img src="/assets/brand/portrait.webp" alt="" width="40" height="40" />' +
        "<span>Ask my AI</span>" +
      "</button>" +
      '<div class="vo-chat__panel" id="vo-chat-panel" role="dialog" aria-label="AI assistant" aria-modal="false" hidden>' +
        '<div class="vo-chat__head">' +
          '<img src="/assets/brand/portrait.webp" alt="" width="38" height="38" />' +
          "<div><strong>Victor's AI Assistant</strong><span>Growth marketing answers, instantly</span></div>" +
          '<button type="button" class="vo-chat__close" aria-label="Close chat">&times;</button>' +
        "</div>" +
        '<div class="vo-chat__body" id="vo-chat-body" role="log" aria-live="polite"></div>' +
        '<div class="vo-chat__chips"></div>' +
        '<form class="vo-chat__form">' +
          '<textarea rows="1" placeholder="Ask about services, results or pricing…" aria-label="Your message" maxlength="800"></textarea>' +
          '<button class="vo-chat__send" type="submit" aria-label="Send message">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4l17.4-8.4L3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>' +
          "</button>" +
        "</form>" +
        '<div class="vo-chat__foot">AI assistant &middot; answers in seconds</div>' +
      "</div>";

    document.body.appendChild(root);

    var toggle = root.querySelector(".vo-chat__toggle");
    var close = root.querySelector(".vo-chat__close");
    var panel = root.querySelector(".vo-chat__panel");
    var body = root.querySelector("#vo-chat-body");
    var form = root.querySelector(".vo-chat__form");
    var input = form.querySelector("textarea");
    var chips = root.querySelector(".vo-chat__chips");
    var history = [];
    var started = false;

    function addMessage(kind, text) {
      var el = document.createElement("div");
      el.className = "vo-chat__msg vo-chat__msg--" + kind;
      el.textContent = text;
      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
      return el;
    }

    function addTyping() {
      var el = document.createElement("div");
      el.className = "vo-chat__msg vo-chat__msg--ai vo-chat__msg--typing";
      el.innerHTML = "<i></i><i></i><i></i>";
      body.appendChild(el);
      body.scrollTop = body.scrollHeight;
      return el;
    }

    function open() {
      root.classList.add("is-open");
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      if (!started) {
        started = true;
        addMessage("ai", "Hi, I'm Victor's AI assistant. Ask me about his services, experience, recent results, pricing or availability.");
        CHAT_OPENERS.forEach(function (q) {
          var chip = document.createElement("button");
          chip.type = "button";
          chip.className = "vo-chat__chip";
          chip.textContent = q;
          chip.addEventListener("click", function () {
            input.value = q;
            send();
          });
          chips.appendChild(chip);
        });
      }
      setTimeout(function () { input.focus(); }, 120);
    }

    function shutdown() {
      root.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      setTimeout(function () {
        if (!root.classList.contains("is-open")) panel.hidden = true;
      }, 300);
    }

    toggle.addEventListener("click", open);
    close.addEventListener("click", shutdown);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("is-open")) shutdown();
    });

    var busy = false;
    function send() {
      var text = input.value.trim();
      if (!text || busy) return;
      busy = true;
      input.value = "";
      input.style.height = "42px";
      addMessage("user", text);
      history.push({ role: "user", content: text });
      var typing = addTyping();

      var done = function (answer) {
        typing.remove();
        addMessage("ai", answer);
        history.push({ role: "assistant", content: answer });
        busy = false;
      };

      postJSON("https://portfolio-9mv6.onrender.com/api/chat", { message: text, history: history.slice(-8) })
        .then(function (data) { done(data.response || localAnswer(text)); })
        .catch(function () { done(localAnswer(text)); });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      send();
    });
    input.addEventListener("input", function () {
      input.style.height = "42px";
      input.style.height = Math.min(input.scrollHeight, 110) + "px";
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }

  /* ======================================================================
     Contact form
     ====================================================================== */
  function initContactForms() {
    document.querySelectorAll("form[data-form='contact']").forEach(function (form) {
      var status = form.querySelector(".form-status");
      var button = form.querySelector("button[type='submit']");
      var original = button ? button.innerHTML : "";
      var wrap = form.closest(".contacts-form");

      function setStatus(text, kind) {
        if (!status) return;
        status.textContent = text;
        status.className = "form-status is-visible is-" + kind;
      }

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var data = {
          name: (form.elements.name.value || "").trim(),
          email: (form.elements.email.value || "").trim(),
          subject: (form.elements.subject.value || "").trim(),
          message: (form.elements.message.value || "").trim(),
          terms: form.elements.terms ? form.elements.terms.checked : true,
        };

        if (!data.name || !data.email || !data.message) {
          setStatus("Please fill in your name, email and message.", "error");
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
          setStatus("That email address doesn't look right. Please check it.", "error");
          return;
        }
        if (!data.terms) {
          setStatus("Please accept the terms to continue.", "error");
          return;
        }

        if (wrap) wrap.classList.add("is-sending");
        if (button) {
          button.classList.add("is-loading");
          button.innerHTML = "<span>Sending…</span>";
        }
        setStatus("", "success");
        if (status) status.className = "form-status";

        postJSON("/api/contact", data)
          .then(function () {
            setStatus("Thanks, " + data.name.split(" ")[0] + ". Your message is on its way — Victor usually replies within one business day.", "success");
            form.reset();
          })
          .catch(function () {
            setStatus("Something went wrong sending the form. Please email " + CONTACT_EMAIL + " directly.", "error");
          })
          .finally(function () {
            if (wrap) wrap.classList.remove("is-sending");
            if (button) {
              button.classList.remove("is-loading");
              button.innerHTML = original;
            }
          });
      });
    });
  }

  /* ======================================================================
     Comments
     ====================================================================== */
  function initComments() {
    document.querySelectorAll("form.comment-form, .comment-respond form").forEach(function (form) {
      if (form.hasAttribute("data-local-form")) return;
      form.setAttribute("data-local-form", "comments");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var name = (form.querySelector("input[name='author'], #author") || {}).value || "Guest";
        var email = (form.querySelector("input[name='email'], #email") || {}).value || "";
        var content = (form.querySelector("textarea[name='comment'], #comment") || {}).value || "";
        var note = form.querySelector(".form-status");
        if (!note) {
          note = document.createElement("div");
          note.className = "form-status";
          form.appendChild(note);
        }
        if (!content.trim()) {
          note.textContent = "Please write a comment first.";
          note.className = "form-status is-visible is-error";
          return;
        }
        postJSON("/api/comments", { author: name, email: email, content: content, url: location.pathname })
          .then(function () {
            note.textContent = "Thanks — your comment has been received and will appear after moderation.";
            note.className = "form-status is-visible is-success";
            form.reset();
          })
          .catch(function () {
            note.textContent = "Could not submit the comment. Please try again.";
            note.className = "form-status is-visible is-error";
          });
      });
    });
  }

  /* ======================================================================
     Search results page
     ====================================================================== */
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function initSearchPage() {
    var results = document.getElementById("search-results");
    if (!results) return;

    var params = new URLSearchParams(location.search);
    var q = (params.get("q") || params.get("s") || "").trim();
    var input = document.querySelector(".vo-search__form input[name='q']");
    var meta = document.getElementById("search-meta");
    var empty = document.getElementById("search-empty");
    if (input) input.value = q;

    if (!q) {
      if (meta) meta.textContent = "Search the journal, notes and case studies.";
      if (empty) {
        empty.hidden = false;
        empty.innerHTML = "Type a keyword above to get started.";
      }
      return;
    }

    if (meta) meta.textContent = "Searching for “" + q + "”…";

    fetch("/api/search?q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = data.results || [];
        if (meta) meta.textContent = items.length + (items.length === 1 ? " result" : " results") + " for “" + q + "”";
        if (!items.length) {
          if (empty) {
            empty.hidden = false;
            empty.innerHTML = "No results for <strong>" + escapeHtml(q) + "</strong>. Try a broader keyword, or <a href=\"/#contact-section\">get in touch</a>.";
          }
          return;
        }
        results.innerHTML = items.map(function (item) {
          return '<div class="col-xs-12 col-sm-6 col-md-6 col-lg-6">' +
            '<div class="archive-item scrolla-element-anim-1 scroll-animate animate__active">' +
              '<div class="desc">' +
                '<div class="category lui-subtitle"><span>' + escapeHtml(item.date || "Article") + "</span></div>" +
                '<h5 class="lui-title"><a href="' + escapeHtml(item.url) + '">' + escapeHtml(item.title) + "</a></h5>" +
                '<div class="lui-text"><p>' + escapeHtml(item.excerpt || "") + "</p></div>" +
              "</div>" +
            "</div>" +
          "</div>";
        }).join("");
      })
      .catch(function () {
        if (meta) meta.textContent = "Search is unavailable right now.";
      });
  }
})();

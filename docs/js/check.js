// Check: sends the address to /api/check and shows the preview and findings
(function () {
  "use strict";
  var byId = function (id) {
    return document.getElementById(id);
  };
  var status = byId("fc-status"),
    form = byId("fc-form"),
    input = byId("fc-url");
  function message(text, kind) {
    status.className = "cmu-flash cmu-flash--" + (kind || "notice");
    status.setAttribute("role", kind === "error" ? "alert" : "status");
    status.textContent = text;
    // The message sits above the form; bring it into view, as from a button
    // at the bottom of a long form on a phone
    status.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  // While FencePost works: the template's spinner where the preview goes,
  // and the words for screen readers only
  function working(text) {
    status.className = "sr-only";
    status.setAttribute("role", "status");
    status.textContent = text;
    byId("fc-figure").hidden = true;
    byId("fc-spinner").hidden = false;
  }
  function done() {
    byId("fc-spinner").hidden = true;
    byId("fc-figure").hidden = false;
  }
  // A site FencePost doesn't capture yet: a notice, not an error, with the
  // next step on its own line
  // A site's Cloudflare bot check: a notice, with how its team can let us in
  function botCheck() {
    message(
      "This site uses Cloudflare to block automated visitors. FencePost can't see the page.",
      "notice",
    );
    var how = document.createElement("a");
    how.className = "cta";
    how.href = "reference.html#cloudflare";
    how.textContent = "See How to Let FencePost In";
    status.append(document.createElement("br"), how);
  }
  function notCaptured() {
    message("This site isn't on FencePost's list yet.", "notice");
    var request = document.createElement("a");
    request.className = "cta";
    request.href = "reference.html#sites";
    request.textContent = "See How to Request a Site";
    status.append(document.createElement("br"), request);
  }
  function fill(id, box, findings) {
    var list = byId(id);
    list.replaceChildren.apply(
      list,
      findings.map(function (finding) {
        var li = document.createElement("li");
        // The tag in bold, then what to do about it
        if (finding.tag) {
          var tag = document.createElement("strong");
          tag.textContent = finding.tag + ":";
          li.append(tag, " ");
        }
        li.append(finding.text);
        return li;
      }),
    );
    byId(box).hidden = !findings.length;
  }
  // The page opens with an example: the Web Kilt's own preview, matching the
  // field's example link. While checking, and after a check fails: the gray
  // placeholder, no text
  function showPlaceholder() {
    var image = byId("fc-image");
    image.onerror = null;
    image.src = "images/placeholder-preview.svg";
    image.alt = "";
    image.hidden = false;
    byId("fc-text").hidden = true;
    byId("fc-caption").hidden = true;
    ["fc-fallback", "fc-image-note"].forEach(function (id) {
      byId(id).hidden = true;
    });
  }
  // Check the same link again, as a news story or post
  byId("fc-article").addEventListener("click", function () {
    form.dispatchEvent(new CustomEvent("submit", { cancelable: true, detail: "article" }));
  });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = form.querySelector('button[type="submit"]'),
      url = input.value.trim(),
      asArticle = event.detail === "article";
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    byId("fc-results").hidden = true;
    // The example is gone after the first check
    byId("fc-preview-label").textContent = "Preview";
    showPlaceholder();
    working("Checking the link.");
    try {
      var response = await fetch("api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url, article: asArticle }),
      });
      var r = await response.json().catch(function () {
        return { error: "That check didn't work. Try again." };
      });
      if (!response.ok) {
        var failure = new Error(r.error);
        failure.status = response.status;
        failure.code = r.code;
        throw failure;
      }
      byId("fc-text").hidden = false;
      byId("fc-caption").hidden = false;
      // The site's name on the top line, as Slack, Teams and Discord show it,
      // or the address when the page has none
      byId("fc-site").textContent = r.siteName || r.host;
      byId("fc-title").textContent = r.title || "No title found";
      byId("fc-description").textContent = r.description;
      var image = byId("fc-image"),
        imageNote = byId("fc-image-note");
      imageNote.hidden = true;
      image.hidden = !(r.image && !r.image.error);
      image.onerror = function () {
        image.hidden = true;
        imageNote.textContent = "Your browser couldn't display the preview image.";
        imageNote.hidden = false;
      };
      if (!image.hidden) {
        image.alt = r.imageAlt;
        image.src = r.image.url;
      } else {
        image.removeAttribute("src");
        imageNote.textContent = r.image
          ? "The preview image couldn't be loaded."
          : "No preview image was found.";
        imageNote.hidden = false;
      }
      var by = function (state) {
        return r.findings.filter(function (finding) {
          return finding.status === state;
        });
      };
      var fixes = by("fix"),
        notes = by("note");
      fill("fc-fixes", "fc-fix-box", fixes);
      fill("fc-notes", "fc-notes-box", notes);
      fill("fc-passes", "fc-pass-box", by("pass"));
      var fallback = [],
        missingTags = [];
      if (
        r.title &&
        fixes.some(function (f) {
          return f.key === "title";
        })
      ) {
        fallback.push("title");
        missingTags.push("og:title");
      }
      if (
        r.description &&
        fixes.some(function (f) {
          return f.key === "description";
        })
      ) {
        fallback.push("description");
        missingTags.push("og:description");
      }
      byId("fc-fallback").textContent = fallback.length
        ? "This preview uses the page's " +
          fallback.join(" and ") +
          " because " +
          missingTags.join(" and ") +
          (missingTags.length === 1 ? " is missing." : " are missing.")
        : "";
      byId("fc-fallback").hidden = !fallback.length;
      // Make can supply the tags as well as an image; carry over editable details
      var params = new URLSearchParams({
        url: r.url,
        title: r.title,
        description: r.description,
        site: r.siteName,
      });
      byId("fc-generate-link").href = "generate.html?" + params.toString();
      var link = new URLSearchParams({ url: url });
      if (asArticle) link.set("article", "1");
      history.replaceState(null, "", "?" + link.toString());
      // Offer to check it as a news story or post, unless that's done
      byId("fc-article-row").hidden = r.findings.some(function (f) {
        return f.key.indexOf("article") === 0;
      });
      byId("fc-results").hidden = false;
      if (fixes.length) {
        var counts = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
        message(
          (counts[fixes.length] || fixes.length) +
            (fixes.length === 1 ? " thing" : " things") +
            " to fix.",
        );
      } else
        message(
          notes.length
            ? "Required checks passed. Review the notes below."
            : "All required checks passed.",
          "success",
        );
    } catch (error) {
      showPlaceholder();
      if (error.status === 403) notCaptured();
      else if (error.code === "bot-check") botCheck();
      else message(error.message, "error");
    } finally {
      done();
      button.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });

  // check.html?url=...(&article=1) runs that check, so a result can be sent
  // as a link; each check puts its own link in the address bar
  var params = new URLSearchParams(location.search),
    start = params.get("url");
  if (start) {
    input.value = start.slice(0, input.maxLength);
    form.dispatchEvent(
      new CustomEvent("submit", {
        cancelable: true,
        detail: params.get("article") === "1" ? "article" : "",
      }),
    );
  }
  // Pasting an address anywhere on the page (not into a field) fills in
  // Link
  document.addEventListener("paste", function (event) {
    var target = event.target;
    if (target.closest && target.closest("input, textarea, select, [contenteditable]")) return;
    var text = (event.clipboardData && event.clipboardData.getData("text")) || "";
    text = text.trim();
    if (!/^[^\s]+\.[^\s]+$/.test(text) || text.length > 2048) return;
    event.preventDefault();
    var field = byId("fc-url");
    field.value = text;
    field.focus();
  });
})();

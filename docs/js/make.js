// Make: sends the form to /api/preview and shows the image and tags
(function () {
  "use strict";
  var byId = function (id) {
    return document.getElementById(id);
  };
  var status = byId("fp-status"),
    imageUrl;
  function message(text, error) {
    status.className = "cmu-flash cmu-flash--" + (error ? "error" : "success");
    status.setAttribute("role", error ? "alert" : "status");
    status.textContent = text;
  }
  // The file as base64, without its data: prefix
  function base64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result).split(",")[1]);
      };
      reader.onerror = function () {
        reject(new Error("The screenshot couldn't be read. Choose it again."));
      };
      reader.readAsDataURL(file);
    });
  }
  // make.html?url=... from Check fills in the address
  var start = new URLSearchParams(location.search).get("url");
  if (start) byId("fp-url").value = start;
  byId("fp-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var button = event.submitter;
    button.disabled = true;
    byId("fp-actions").hidden = true;
    byId("fp-figure").hidden = true;
    message("Making your preview. Capturing a page can take up to half a minute.");
    try {
      var payload = {
        url: byId("fp-url").value.trim(),
        title: byId("fp-title").value,
        description: byId("fp-description").value,
        site: byId("fp-site").value,
        imagePath: byId("fp-path").value,
      };
      var file = byId("fp-file").files[0];
      if (file) {
        if (file.size > 8 * 1024 * 1024) throw new Error("Choose a screenshot under 8 MB.");
        payload.screenshot = await base64(file);
      }
      var response = await fetch("api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var result = await response.json().catch(function () {
        return { error: "That preview didn't work. Try again." };
      });
      if (!response.ok) throw new Error(result.error);
      var bytes = Uint8Array.from(atob(result.image), function (c) {
        return c.charCodeAt(0);
      });
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
      byId("fp-preview").src = imageUrl;
      byId("fp-figure").hidden = false;
      byId("fp-download").href = imageUrl;
      byId("fp-tags").textContent = result.tags;
      byId("fp-actions").hidden = false;
      message("Your preview is ready. Save the image with your site, then copy the tags.");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
})();

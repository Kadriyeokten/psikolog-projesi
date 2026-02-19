document.addEventListener("DOMContentLoaded", () => {
  fetch("/api/site-content")
    .then((res) => res.json())
    .then((data) => {
      const title = document.getElementById("about_title");
      if (title) title.innerText = data.about_title || "";

      const text = document.getElementById("about_text");
      if (text) text.innerText = data.about_text || "";

      setText("feature_title1", data.feature_title1);
      setText("feature_title2", data.feature_title2);
      setText("feature_title3", data.feature_title3);

      setText("feature_desc1", data.feature_desc1);
      setText("feature_desc2", data.feature_desc2);
      setText("feature_desc3", data.feature_desc3);

      setText("feature1", data.feature1);
      setText("feature2", data.feature2);
      setText("feature3", data.feature3);
      setText("feature4", data.feature4);

      const img = document.getElementById("about_image");

      if (img && data.about_image) {
        img.src = data.about_image;
      } else if (img) {
        img.src = "/assets/images/about-banner.png";
      }
    })
    .catch((err) => {
      console.error("About verisi çekilemedi:", err);
    });
});

function setText(id, value) {
  const el = document.getElementById(id);

  if (el) {
    el.innerText = value || "";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  let featureData = {};

  fetch("/api/site-content")
    .then((res) => res.json())
    .then((data) => {
      featureData = data;

      setText("feature_title1", data.feature_title1);
      setText("feature_title2", data.feature_title2);
      setText("feature_title3", data.feature_title3);

      showFeatureDesc(1);
    });

  document.getElementById("feature_title1")?.addEventListener("click", () => {
    setActive(1);
    showFeatureDesc(1);
  });

  document.getElementById("feature_title2")?.addEventListener("click", () => {
    setActive(2);
    showFeatureDesc(2);
  });

  document.getElementById("feature_title3")?.addEventListener("click", () => {
    setActive(3);
    showFeatureDesc(3);
  });

  function showFeatureDesc(no) {
    const desc = document.getElementById("feature_desc1");

    if (!desc) return;

    if (no === 1) desc.innerText = featureData.feature_desc1 || "";
    if (no === 2) desc.innerText = featureData.feature_desc2 || "";
    if (no === 3) desc.innerText = featureData.feature_desc3 || "";
  }

  function setActive(no) {
    document
      .querySelectorAll(".tab-btn")
      .forEach((btn) => btn.classList.remove("active"));

    document.getElementById("feature_title" + no)?.classList.add("active");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value || "";
  }
});

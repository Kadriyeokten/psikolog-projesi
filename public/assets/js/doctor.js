document.addEventListener("DOMContentLoaded", () => {
  loadDoctors();
});

async function loadDoctors() {
  try {
    const res = await fetch("http://localhost:3000/api/doctors");
    const doctors = await res.json();

    const container = document.getElementById("doctorsContainer");

    container.innerHTML = "";

    doctors.forEach((doc) => {
      const box = `
        <div class="box">

          <img src="${doc.image}" alt="${doc.name}">

          <h3>${doc.name}</h3>
          <span>${doc.title}</span>

          <div class="share">
            <a href="${doc.facebook || "#"}" class="fab fa-facebook-f"></a>
            <a href="${doc.twitter || "#"}" class="fab fa-twitter"></a>
            <a href="${doc.instagram || "#"}" class="fab fa-instagram"></a>
            <a href="${doc.linkedin || "#"}" class="fab fa-linkedin"></a>
          </div>

        </div>
      `;

      container.innerHTML += box;
    });

  } catch (err) {
    console.error("Doktorlar alınamadı:", err);
  }
}

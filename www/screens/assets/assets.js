function initAssetsScreen() {
  const items = [
    { name: "HVAC System", serviceDate: "2026-06-12" },
    { name: "Water Heater", serviceDate: "2026-04-01" },
    { name: "Roof", serviceDate: "2025-11-20" },
  ];

  const tbody = document.querySelector("#assetTable tbody");
  if (!tbody) return;

  tbody.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${item.name}</td>
          <td>${item.serviceDate}</td>
        </tr>
      `
    )
    .join("");
}

window.initAssetsScreen = initAssetsScreen;

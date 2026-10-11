(function(){
  "use strict";

  // Кейін бұл нысанды серверден алынған нақты деректермен ауыстыруға болады.
  const results = {
    total: 116,
    groups: [
      {key: "teachers", label: "Мұғалімдер", value: 20, color: "#2F6B45", icon: "👩‍🏫"},
      {key: "students", label: "Оқушылар", value: 45, color: "#8DB64A", icon: "🎓"},
      {key: "parents", label: "Ата-аналар", value: 18, color: "#E3B23C", icon: "🏡"},
      {key: "others", label: "Басқалар", value: 33, color: "#3E8DB8", icon: "🌿"}
    ]
  };

  window.SARYSU_RESULTS = Object.freeze({
    total: results.total,
    groups: Object.freeze(results.groups.map(group => Object.freeze(group)))
  });
})();

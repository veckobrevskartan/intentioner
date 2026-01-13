// Lägg över din EVENTS-array här från veckobrevskartan.
// Formatstöd (flexibelt):
// { date:"2026-01-12", cat:"INFRA", country:"Sverige", title:"...", place:"...", url:"...", summary:"...", source:"..." }
// Du kan även använda: { time:"2026-01-12", ... } eller { dt:"2026-01-12", ... }

const EVENTS = [
  {
    date: "2026-01-11",
    cat: "INFRA",
    country: "Sverige",
    place: "Växjö",
    title: "Stöld av elbilskablar",
    summary: "Exempelpost – byt ut mot dina riktiga events.",
    url: "https://polisen.se/aktuellt/handelser/2026/januari/11/11-januari-22.45-stold-vaxjo/",
    source: "polisen.se",
    likelihood: "bekraftat",
    risk: 3
  },
  {
    date: "2026-01-12",
    cat: "GPS",
    country: "Finland",
    place: "Östersjön",
    title: "GNSS-störningar påverkar trafik",
    summary: "Exempelpost – byt ut mot dina riktiga events.",
    url: "",
    source: "myndighet",
    likelihood: "sannolikt",
    risk: 4
  },
  {
    date: "2026-01-12",
    cat: "DRONE",
    country: "Sverige",
    place: "Wallhamn",
    title: "Drönarlarm i hamnområde",
    summary: "Exempelpost – byt ut mot dina riktiga events.",
    url: "",
    source: "media",
    likelihood: "troligt",
    risk: 3
  }
];

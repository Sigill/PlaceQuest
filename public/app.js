var placesVM = undefined;
jQuery(document).ready(function($){
  $(".sidebar-control").on('click', _ => {
    document.getElementById("sidebar").classList.toggle("collapsed");
    document.getElementById("sidebar-header").classList.toggle("collapsed");
  });

  let popup = L.popup();
  let map = L.map('map', {zoomControl: false}).setView([48.77199820642046, 2.0856456177490124], 15);

  L.control.zoom({position:'topright'}).addTo(map);

  L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1
  }).addTo(map);

  map.on('click', function(e) { popup.setLatLng(e.latlng).setContent(e.latlng.toString()).openOn(this); });

  function placeTitle(p) { return `${p.surface} m² ${p.price}k ${Math.round(1000 * p.price / p.surface)} /m²`; }

  let places = [];
  let selectedPlace = undefined;

  function LeafletTooltipApp(place) {
    return Vue.createApp({}).component('leaflet-place-tooltip', {
      data() { return { place: place } },
      methods: {
        title() { return placeTitle(this.place); }
      },
      // render() { return Vue.h('span', {}, this.title()); }
      render() { return Vue.createTextVNode(this.title()); }
      // template: 'plop'
    });
  }

  function LeafletPlaceMarkerApp(place) {
    return Vue.createApp({}).component('leaflet-place-marker', {
      data() { return { place: place } },
      methods: {
        markerColor() {
          if (this.place.type == 'M') return '#0bc32b';
          if (this.place.type == 'T2') return '#c30b82';
          if (this.place.type == 'T3') return '#0b73c3';
        }
      },
      template: `
      <div :style="{ backgroundColor: markerColor() }" class="marker-pin"></div>
      <i v-if="place.type === 'M'" class="material-icons" style="color: rgb(0, 0, 0);">house</i>
      <span v-else-if="place.type === 'T3' || place.type === 'T4'" style="color: rgb(0, 0, 0);">{{ place.type }}</span>
      `
    });
  }

  let placesApp = Vue.createApp({
    data() {
      return {
        places: places,
        selectedPlace: selectedPlace
      }
    },
    mounted() {},
    methods: {
      title(p) { return placeTitle(p); },
      addPlaceToMap(p) {
        var vm = this;

        p.markerIconApp = LeafletPlaceMarkerApp(p);
        let markerIconNode = document.createElement('div');
        {
          markerIconNode.appendChild(document.createElement('leaflet-place-marker'));
          p.markerIconApp.mount(markerIconNode);
        }

        p.markerTooltipApp = LeafletTooltipApp(p);
        let markerTooltipNode = document.createElement('span');
        {
          markerTooltipNode.appendChild(document.createElement('leaflet-place-tooltip'));
          p.markerTooltipApp.mount(markerTooltipNode);
        }

        p.marker = L.marker([p.lat, p.lon],
          {
            icon: L.divIcon({
              className: 'custom-div-icon',
              html: markerIconNode,
              iconSize: [30, 42],
              iconAnchor: [15, 42]
            })
          });

        p.marker.bindTooltip(markerTooltipNode,
                             {permanent: true, direction: 'right', offset: {x: 10, y: -19}, className: 'text-only-tooltip'});

        p.marker.on('click', function(e) { vm.selectedPlace = p; });

        p.marker.addTo(map);
      },
      placeVisibilityChanged(place) {
        if (place.visible)
          place.marker.addTo(map);
        else
          place.marker.remove();
      }
    },
    watch: {
      selectedPlace(curr, prev) {
        if (prev)
          prev.selected = false;
        curr.selected = true;
        map.setView([curr.lat, curr.lon]);
      }
    }
  });

  placesVM = placesApp.mount('#places');

  axios({method: 'get', url: '/places', responseType: 'json', headers: {'Accept': 'application/json' }})
  .then(function (response) {
    response.data.forEach((p) => {
      p.visible = true; p.selected = false;
      placesVM.places.push(p);
      placesVM.addPlaceToMap(p); });
  });
});

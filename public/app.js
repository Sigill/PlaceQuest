var placesVM = undefined;
let map = undefined;
jQuery(document).ready(function($){
  map = L.map('map', {zoomControl: false});
  map.fitWorld();

  L.control.zoom({position:'topright'}).addTo(map);

  L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    id: 'mapbox/streets-v11',
    tileSize: 512,
    zoomOffset: -1
  }).addTo(map);

  function placeTitle(p) { return `${p.type.abbr} ${p.surface}m² ${p.price}k ${Math.round(1000 * p.price / p.surface)}/m²`; }

  function LeafletTooltipApp(place) {
    return Vue.createApp({}).component('leaflet-place-tooltip', {
      data() { return { place: place } },
      methods: {
        title() { return placeTitle(this.place); }
      },
      render() { return Vue.createTextVNode(this.title()); }
    });
  }

  function LeafletPlaceMarkerApp(place) {
    return Vue.createApp({}).component('leaflet-place-marker', {
      data() { return { place: place } },
      template: `
      <div :style="{ backgroundColor: place.type.color }" class="marker-pin"></div>
      <i v-if="place.type.icon != null" class="material-icons" style="color: rgb(0, 0, 0);">{{ place.type.icon }}</i>
      <span v-else style="color: rgb(0, 0, 0);">{{ place.type.abbr }}</span>
      `
    });
  }

  let placesApp = Vue.createApp({
    data() {
      return {
        place_types: [],
        places: [],
        selectedPlace: undefined,
        formModel: {},
        mode: undefined,
        sidebarMode: 'compact'
      }
    },
    computed: {
      modal() { return new bootstrap.Modal(document.getElementById('placeEditModal')); }
    },
    methods: {
      decoratePlaceModel(p) {
        p.type = this.place_types.find(t => t.id == p.type_id);

        p.visible = true;
        p.selected = false;
      },
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

        p.marker.on('dragend', function(e) {
          vm.relocate(p, e.target.getLatLng().lat, e.target.getLatLng().lng);
        });

        p.marker.addTo(map);
      },
      registerPlace(p) {
        this.decoratePlaceModel(p);
        this.places.unshift(p);
        this.addPlaceToMap(p);
      },
      title(p) { return placeTitle(p); },
      placeVisibilityChanged(place) {
        if (place.visible)
          place.marker.addTo(map);
        else
          place.marker.remove();
      },
      openForm() { this.modal.show(); },
      discardForm() {
        this.mode = undefined;
        this.formModel.id = undefined;
        this.formModel.type_id = undefined;
        this.formModel.title = undefined;
        this.formModel.surface = undefined;
        this.formModel.price = undefined;
        this.formModel.description = undefined;
        this.formModel.sold = undefined;
        this.formModel.future = undefined;
        this.modal.hide();
      },
      edit(p) {
        this.mode = 'editPlace';
        this.formModel.id = p.id;
        this.formModel.type_id = p.type.id;
        this.formModel.title = p.title;
        this.formModel.surface = p.surface;
        this.formModel.price = p.price;
        this.formModel.description = p.description;
        this.formModel.sold = p.sold;
        this.formModel.future = p.future;
        this.openForm();
      },
      create() {
        let vm = this;
        axios.post('/places',
                  JSON.stringify(this.formModel),
                  {responseType: 'json', headers: {'Accept': 'application/json' }})
        .then(
          function(response) { vm.registerPlace(response.data) },
          function (error) {
            let data = error.response.data.errors;
            let first = Object.keys(data)[0];
            alert(`Error: ${first} ${data[first]}`);
          });
      },
      update() {
        let vm = this;
        axios.put(`/places/${this.formModel.id}`,
                  JSON.stringify(this.formModel),
                  {responseType: 'json', headers: {'Accept': 'application/json' }})
        .then(
          function (response) {
            let data = response.data;
            let dest = vm.places.find((p) => p.id == data.id);
            if (dest) {
              dest.type = vm.place_types.find(t => t.id == data.type_id);
              dest.title = data.title;
              dest.surface = data.surface;
              dest.price = data.price;
              dest.description = data.description;
              dest.sold = data.sold;
              dest.future = data.future;
            } else {
              alert("Something wrong happened");
            }
          },
          function (error) {
            let data = error.response.data.errors;
            let first = Object.keys(data)[0];
            alert(`Error: ${first} ${data[first]}`);
          });
      },
      commit() {
        if(this.mode == 'createPlace') {
          this.create();
        } else if (this.mode == 'editPlace') {
          this.update();
        }
        this.discardForm();
        this.mode = undefined;
      },
      toggleDepositMode() {
        this.mode = this.mode == 'depositPlace' ? undefined : 'depositPlace';
      },
      relocate(p, lat, lon) {
        axios.put(`/places/${p.id}`,
                  JSON.stringify({'lat': lat, 'lon': lon}),
                  {responseType: 'json', headers: {'Accept': 'application/json' }})
        .then(
          function (response) {
            p.lat = response.data.lat;
            p.lon = response.data.lon;
          },
          function (error) {
            let data = error.response.data.errors;
            let first = Object.keys(data)[0];
            alert(`Error: ${first} ${data[first]}`);
            p.marker.setLatLng([lat, lon]);
          });
      },
      toggleMovable() {
        this.mode = (this.mode ==  'editLocation' ? undefined : 'editLocation');
        this.places.forEach(p => this.mode == 'editLocation' ? p.marker.dragging.enable() : p.marker.dragging.disable());
      },
      toggleCompactSidebar() {
        this.sidebarMode = this.sidebarMode == 'compact' ? 'collapsed' : 'compact';
      },
      toggleExpandedSidebar() {
        this.sidebarMode = this.sidebarMode == 'expanded' ? 'collapsed' : 'expanded';
      }
    },
    watch: {
      selectedPlace(curr, prev) {
        if (prev)
          prev.selected = false;
        curr.selected = true;
        map.setView([curr.lat, curr.lon]);
      },
      mode(curr, prev) {
        if (prev == 'depositPlace') {
          map.off('click');
        }

        if (curr == 'depositPlace') {
          let vm = this;
          map.on('click', function(e) {
            vm.formModel.id = -1;
            vm.formModel.lat = e.latlng.lat;
            vm.formModel.lon = e.latlng.lng;
            vm.mode = 'createPlace';
            vm.openForm();
          });
        }
      },
      sidebarMode(curr, prev) {
        document.getElementById("sidebar").classList.replace(prev, curr);
        document.getElementById("sidebar-control").classList.replace(prev, curr);
        document.getElementById("map").classList.replace(prev, curr);
      }
    },
    mounted() {
      let vm = this;
      let typesq = axios({method: 'get', url: '/placetypes', responseType: 'json', headers: {'Accept': 'application/json' }});
      let placesq = axios({method: 'get', url: '/places', responseType: 'json', headers: {'Accept': 'application/json' }});

      typesq.then(response => {
        vm.place_types = response.data;

        placesq.then(response => {
          response.data.forEach(vm.registerPlace);
          if (vm.places.length > 0) {
            map.setView([vm.places[0].lat, vm.places[0].lon], 15)
          }
        });
      });
    }
  });

  placesVM = placesApp.mount('#places-app');

  new ResizeObserver(() => { map.invalidateSize(); }).observe(map._container);
});

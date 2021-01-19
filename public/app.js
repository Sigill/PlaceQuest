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

  function pricePerSq(p) { return Math.round(1000 * p.price / p.surface); }
  function placeTitle(p) {
    let txt = p.type.abbr;
    if (p.surface || p.price) {
      if (p.surface) txt = `${txt} ${p.surface}m²`;
      if (p.price) txt = `${txt} ${p.price}k€`;
      if (p.surface && p.price) txt = `${txt} ${pricePerSq(p)} €/m²`;
    } else {
      if (p.title) txt = `${txt} (${p.title})`;
    }
    return txt;
  }

  function LeafletTooltipApp(place) {
    return Vue.createApp({}).component('leaflet-place-tooltip', {
      data() { return { place: place } },
      methods: {
        title() { return placeTitle(this.place); }
      },
      template: `<span :class="{'d-none': !place.available || !place.visible}">{{ title() }}</span>`
    });
  }

  function LeafletPlaceMarkerApp(place) {
    return Vue.createApp({}).component('leaflet-place-marker', {
      data() { return { place: place } },
      methods: {
        markerColor() { return this.place.sold ? '#999' : this.place.type.color; },
        markerFilter() { return this.place.future ? 'blur(.5px)' : 'none'; }
      },
      template: `
      <div :class="{'d-none': !place.available || !place.visible}">
        <div class="marker-pin" :class="{ stripe: place.future }" :style="{ backgroundColor: markerColor(), color: markerColor(), filter: markerFilter() }" ></div>
        <i v-if="place.type.icon != null" class="material-icons">{{ place.type.icon }}</i>
        <span v-else>{{ place.type.abbr }}</span>
      </div>
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
        sidebarMode: 'compact',
        sortKey: undefined,
        sortOrder: undefined,
        filter_types: [],
        filter_surface_min: undefined,
        filter_surface_max: undefined,
        filter_price_min: undefined,
        filter_price_max: undefined,
        filter_sprice_min: undefined,
        filter_sprice_max: undefined,
        filter_sold: true,
        filter_unsold: true,
        filter_constructed: true,
        filter_in_construction: true
      }
    },
    computed: {
      modal() { return new bootstrap.Modal(document.getElementById('placeEditModal')); }
    },
    methods: {
      isPlaceFilteredIn(p) {
        if (this.filter_sold != this.filter_unsold) {
          if (this.filter_sold != p.sold)
            return false;
          if (this.filter_unsold != !p.sold)
            return false;
        }

        if (this.filter_constructed != this.filter_in_construction) {
          if (this.filter_constructed != !p.future)
            return false;
          if (this.filter_in_construction != p.future)
            return false;
        }

        if (this.filter_types.length > 0 && !this.filter_types.includes(p.type.abbr))
          return false;

        if (this.filter_surface_min && p.surface && p.surface < this.filter_surface_min)
          return false;
        if (this.filter_surface_max && p.surface && p.surface > this.filter_surface_max)
          return false;

        if (this.filter_price_min && p.price && p.price < this.filter_price_min)
          return false;
        if (this.filter_price_max && p.price && p.price > this.filter_price_max)
          return false;

        if (this.filter_sprice_min && p.price && p.surface && this.pricePerSq(p) < this.filter_sprice_min)
          return false;
        if (this.filter_sprice_max && p.price && p.surface && this.pricePerSq(p) > this.filter_sprice_max)
          return false;

        return true;
      },
      displayedPlaces() {
        let sel = this.places.filter(p => this.isPlaceFilteredIn(p));

        if (this.sortKey && this.sortOrder) {
          let cmp = (a, b) => { return 0; }

          if (this.sortKey == 'type') {
            cmp = (a, b) => {
              if (a.type.abbr > b.type.abbr) { return 1; }
              if (a.type.abbr < b.type.abbr) { return -1; }
              return 0;
            };
          } else if (this.sortKey == "surf") {
            cmp = (a, b) => { return (a.surface && b.surface) ? (a.surface - b.surface) : 0; };
          } else if (this.sortKey == "price") {
            cmp = (a, b) => { return (a.price && b.price) ? (a.price - b.price) : 0; };
          } else if (this.sortKey == "sprice") {
            cmp = (a, b) => { return (a.surface && b.surface && a.price && b.price) ? (this.pricePerSq(a) - this.pricePerSq(b)) : 0; };
          }

          sel.sort(cmp);

          if (this.sortOrder == "desc")
            sel.reverse();
        }

        this.places.forEach(p => {
          p.available = sel.includes(p);
        });

        return sel;
      },
      decoratePlaceModel(p) {
        p.type = this.place_types.find(t => t.id == p.type_id);

        p.available = true;
        p.visible = true;
        p.selected = false;
      },
      setSelectedPlace(p, scroll) {
        this.selectedPlace = p;
        if (scroll)
          this.scrollToCurr();
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

        p.marker.on('click', function(e) {
          vm.setSelectedPlace(p, true);
        });

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
      pricePerSq(p) { return pricePerSq(p); },
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
          function(response) {
            vm.registerPlace(response.data);
            vm.setSelectedPlace(response.data, true);
          },
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
      },
      unsorted(key) {
        return this.sortKey != key || this.sortOrder == undefined;
      },
      ascSorted(key) {
        return this.sortKey == key && this.sortOrder == "asc";
      },
      descSorted(key) {
        return this.sortKey == key && this.sortOrder == "desc";
      },
      toggleSort(k) {
        if (this.sortKey != k) {
          this.sortKey = k;
          this.sortOrder = 'asc';
        } else {
          if (this.sortOrder == 'asc')
            this.sortOrder = 'desc';
          else if (this.sortOrder == 'desc')
            this.sortOrder = undefined;
          else
            this.sortOrder = 'asc';
        }
      },
      scrollToCurr() {
        this.$nextTick(_ => document.getElementById('scrollable-place-list').scrollTo(0, document.getElementById(`place${this.selectedPlace.id}`).offsetTop));
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

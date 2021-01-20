#!/usr/bin/ruby
# encoding: UTF-8

require 'rubygems'
require 'sinatra'
require 'sinatra/base'
require 'thin'
require 'json'
require 'tilt/haml'
require_relative 'database'

set :server, 'thin'
set :haml, { attr_wrapper: '"' }

module JSONHelper
  def json_body
    request.body.rewind
    return JSON.parse(request.body.read)
  rescue
    halt 400, JSON.generate({message: 'Invalid payload'})
  end
end

class PlacesWebController < Sinatra::Base
  before do
      @stylesheets = [
        '//cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta1/dist/css/bootstrap.min.css',
        '//fonts.googleapis.com/icon?family=Material+Icons',
        url('style.css')
      ]
      @scripts = [
        '//cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta1/dist/js/bootstrap.bundle.min.js'
      ]
  end

  get '/' do
    @stylesheets.insert(-2, url('leaflet/leaflet.css'))

    @scripts << '//code.jquery.com/jquery-3.5.1.slim.min.js'
    @scripts << url('leaflet/leaflet.js')
    @scripts << '//cdn.jsdelivr.net/npm/axios/dist/axios.min.js'
    @scripts << '//unpkg.com/vue@next'
    @scripts << url('app.js')

    haml :map, layout: :main_layout
  end
end

class PlacesJSONController < Sinatra::Base
  helpers JSONHelper

  set :show_exceptions, false

  before do
    content_type :json
  end

  def place_from_id_param
    halt 400, JSON.generate({message: 'Invalid ID'}) unless params['id'] =~ /\d+/
    place = Place[params['id'].to_i]
    halt 404, JSON.generate({message: 'Not Found'}) if place.nil?
    return place
  end

  def save_place(place)
    place.save(raise_on_failure: true)
    place.to_json
  rescue
    halt 400, JSON.generate({message: 'Invalid payload', errors: place.errors})
  end

  get '/places', :provides => 'json' do
    Place.all.to_json
  end

  post '/places', provides: :json do
    save_place(Place.new { |p| p.set_fields(json_body(), Place.data_columns, missing: :skip) })
  end

  get '/places/:id', provides: :json do
    place_from_id_param().to_json
  end

  put '/places/:id', provides: :json do
    place = place_from_id_param()
    place.set_fields(json_body(), Place.data_columns, missing: :skip)
    save_place(place)
  end

  delete '/places/:id', provides: :json do
    place_from_id_param().destroy
    status 200
  end
end

class PlaceTypesJSONController < Sinatra::Base
  helpers JSONHelper

  set :show_exceptions, false

  before do
    content_type :json
  end

  def placetype_from_id_param
    halt 400, JSON.generate({message: 'Invalid ID'}) unless params['id'] =~ /\d+/
    placetype = PlaceType[params['id'].to_i]
    halt 404, JSON.generate({message: 'Not Found'}) if placetype.nil?
    return placetype
  end

  def save_placetype(placetype)
    placetype.save(raise_on_failure: true)
    placetype.to_json
  rescue
    halt 400, JSON.generate({message: 'Invalid payload', errors: placetype.errors})
  end

  get '/placetypes', :provides => 'json' do
    PlaceType.all.to_json
  end

  post '/placetypes', provides: :json do
    save_place(PlaceType.new { |p| p.set_fields(json_body(), PlaceType.data_columns, missing: :skip) })
  end

  get '/placetypes/:id', provides: :json do
    placetype_from_id_param().to_json
  end

  put '/placetypes/:id', provides: :json do
    place = placetype_from_id_param()
    place.set_fields(json_body(), Place.data_columns, missing: :skip)
    save_place(place)
  end

  delete '/placetypes/:id', provides: :json do
    placetype_from_id_param().destroy
    status 200
  end
end

class App < Sinatra::Base
  use PlacesWebController
  use PlacesJSONController
  use PlaceTypesJSONController
end

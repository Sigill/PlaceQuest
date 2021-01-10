require 'sequel'
require 'json'

DB = Sequel.connect("sqlite://#{File.expand_path "./places.db"}")
DB.run "PRAGMA encoding='UTF-8';"
DB.run "PRAGMA page_size=65536;"
DB.run "PRAGMA journal_mode=WAL;"
#DB.run "PRAGMA locking_mode=EXCLUSIVE;"
DB.run "PRAGMA synchronous = NORMAL;"

DB.create_table?(:place_types) do
  primary_key :id
  String :name, size: 32, null: false, unique: true
  String :color, size: 16, null: false
  String :icon, size: 32, null: true
  String :abbr, size: 2, null: false
end

class PlaceType < Sequel::Model
  plugin :json_serializer

  def self.data_columns
    %w{name color icon abbr}
  end
end

if PlaceType.empty?
  PlaceType.new(name: "Work", color: '#ffd700', icon: 'business_center', abbr: 'W').save
  PlaceType.new(name: "House", color: '#0bc32b', icon: 'house', abbr: 'H').save
  PlaceType.new(name: "T3", color: '#c30b82', icon: nil, abbr: 'T3').save
  PlaceType.new(name: "T4", color: '#0b73c3', icon: nil, abbr: 'T4').save
end

PlaceType.columns # load columns


DB.create_table?(:places) do
  primary_key :id
  Float :lat, null: false
  Float :lon, null: false
  foreign_key :type_id, :place_types
  String :title, null: true, default: ''
  Integer :surface, null: false, default: 0
  Integer :price, null: false, default: 0
  String :description, null: false, text: true, default: ''
  String :url, null: false, text: true, default: ''
  TrueClass :sold, null: false, default: false
  TrueClass :future, null: false, default: false
end

class Place < Sequel::Model
  plugin :json_serializer
  plugin :defaults_setter

  def self.data_columns
    %w{lat lon type_id title surface price description url sold future}
  end
end

Place.columns # load columns

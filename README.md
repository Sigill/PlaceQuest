# <span>Ho.me</span>

<span>Ho.me</span> is a webapp I wrote to keep track of opportunities when looking for a new place to live.

## Configure

Copy `config.osm.json` to `config.json` to configure <https://www.openstreetmap.org> as the tile map service.

## Install

```sh
bundle install --path ./vendor
bundle exec ./vendor/bundle/ruby/2.5.0/bin/rerun 'rackup config.ru -o 0.0.0.0 -p 4567'

```

## License

This tool is released under the terms of the MIT License. See the LICENSE.txt file for more details.

// Eigene ÖBB-Fahrplan-API (hafas-rest-api) – z. B. am Raspberry Pi.
import {createClient} from 'hafas-client'
import {profile as oebbProfile} from 'hafas-client/p/oebb/index.js'
import {createHafasRestApi} from 'hafas-rest-api'
import express from 'express'

const hafas = createClient(oebbProfile, 'rundreise-noah (github.com/maebx-cmd/Kochstrasse)')
const api = await createHafasRestApi(hafas, {
  hostname: process.env.HOSTNAME || 'localhost',
  name: 'oebb-rest-rundreise',
  homepage: 'https://github.com/maebx-cmd/Kochstrasse',
  version: '1.0.0',
  aboutPage: false,
  cors: true,
  etags: 'weak',
  logging: false,
})
const app = express()
app.use('/api', api)
const port = +process.env.PORT || 3000
app.listen(port, () => console.log('ÖBB-API läuft auf Port ' + port + ' unter /api'))

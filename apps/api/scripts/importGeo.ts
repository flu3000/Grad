import dotenv from "dotenv";
dotenv.config();
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { Subprefecture } from '../src/models/Subprefecture';
import { Neighborhood } from '../src/models/Neighborhood';
import { convertGeometry } from '../src/utils/convertCoordinates';
import { fixGeometry } from '../src/utils/fixGeometry';

async function importSubprefectures() {
  console.log('--- Importando SUBPREFEITURAS ---');

  const file = path.join(__dirname, '../data/geosampa/subprefeituras.geojson');
  const geo = JSON.parse(fs.readFileSync(file, 'utf-8'));

  await Subprefecture.deleteMany({});

  for (const feature of geo.features) {
    const props = feature.properties;
    const geometry = convertGeometry(fixGeometry(feature.geometry));

    await Subprefecture.create({
      name: props.nm_subprefeitura,
      sourceId: props.cd_identificador_subprefeitura,
      geometry: convertGeometry(fixGeometry(feature.geometry))
    });

    console.log('✔ Subprefeitura:', props.nm_subprefeitura);
  }
}

function getAnyCoordinate(geometry: any): [number, number] {
  let coords = geometry.coordinates;
  while (Array.isArray(coords[0])) coords = coords[0];
  return coords;
}

async function importDistricts() {
  console.log('--- Importando DISTRITOS ---');

  const file = path.join(__dirname, '../data/geosampa/distritos.geojson');
  const geo = JSON.parse(fs.readFileSync(file, 'utf-8'));

  await Neighborhood.deleteMany({});

  for (const feature of geo.features) {

    const props = feature.properties;

    const subprefecture = await Subprefecture.findOne({
      sourceId: props.cd_identificador_subprefeitura
    });

    if (!subprefecture) {
      console.log(
        "Subprefeitura NÃO encontrada:",
        props.cd_identificador_subprefeitura
      );
      continue;
    }

    await Neighborhood.create({
      name: props.nm_distrito_municipal,
      sourceId: props.cd_identificador_distrito,
      city: "São Paulo",
      state: "SP",
      subprefecture: subprefecture._id,
      geometry: convertGeometry(fixGeometry(feature.geometry))
    });

    console.log("✔ Distrito:", props.nm_distrito_municipal);
  }
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI!);

  console.log('\nLimpando banco...');
  await Subprefecture.deleteMany({});
  await Neighborhood.deleteMany({});

  await importSubprefectures();
  await importDistricts();
  // falta importar os dados dos bairros do rio

  console.log('\n🎉 BANCO GEOESPACIAL PRONTO!');
  process.exit();
}

run();

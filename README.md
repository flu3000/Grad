# Grad

Interactive safety map of São Paulo that shows how dangerous each area is,
based on police report (boletim de ocorrência) data from the city.

## How it works
- **Data:** a large dataset of police reports filed in São Paulo
- **Severity scale:** each crime type is assigned a weight, so a robbery
  counts more than a minor offense
- **Hexagonal grid:** the city is divided into hexagonal regions, and each
  hex gets a danger score based on the weighted density of crimes inside it
- **Visualization:** hexes range from neutral to red as the score increases,
  making high-risk areas visible at a glance

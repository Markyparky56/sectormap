//import THREE from './three'; 
import QuadTree from './QuadTree';
import SectorMap from './sectormap.spiral.js';
import SubSectorMap from './subsectormap.withghost.js';
import genPointsSpiral4 from './pointgenspiral';

// Seed the random number generator
Math.seedrandom("316");

// Set up the THREE.js canvas
let canvasWidth = 1000;
let canvasHeight = 900;
let aspect = canvasWidth/canvasHeight;
let frustumSize = 800;
let scene = new THREE.Scene();
let perspectiveCamera = new THREE.PerspectiveCamera(90, aspect, 0.1, 10000);
let camera = perspectiveCamera;
let renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(canvasWidth, canvasHeight);
renderer.setClearColor(0x999999, 1);
document.body.appendChild(renderer.domElement);

let clock = new THREE.Clock();
let time = 0, delta = 0;

let cameraRadius = 500;
let cameraHeight = 825;
let cameraRotSpeed = -2.5 * Math.PI / 180;
let cameraAngle = 0;

// Set initial camera position
camera.position.set(0, cameraHeight, 0);
camera.lookAt(new THREE.Vector3(camera.position.x, camera.position.y-1, camera.position.z));

// Create our sector map object
let start = performance.now();
let sectorMap = new SectorMap(6, genPointsSpiral4);
let end = performance.now();
console.log("Time to generate SectorMap", (end - start), "ms");

let lineMaterial = new THREE.LineBasicMaterial({color:0xff00ff});

let pointMat = new THREE.PointsMaterial({color: 0x00ff00});
let pointGeometry = sectorMap.pointArrGeometry;
let points = new THREE.Points(pointGeometry, pointMat);

// Collect regions from Sector Map and add meshes to scene,
// and create subsectors for each region
let regions = [];
let minArea = sectorMap.minArea;
let maxArea = sectorMap.maxArea;
let numSubSectors = 0;
let regionGenStart = performance.now();
for(let region = 0; region < sectorMap.regionTriGeometry.length; region++)
//for(let region = 0; region < 1; region++)
{
  let regionObj = sectorMap.regions[region];
  let mesh, outline;
  let area = regionObj.area;
  let shade = ((area - minArea) / (maxArea - minArea));
  let color = 0 | (shade*0xff << 8);
  let meshNormalMat = new THREE.MeshBasicMaterial({color: color, wireframe: false});
  mesh = new THREE.Mesh(sectorMap.regionTriGeometry[region], meshNormalMat);
  mesh.userData = {area:area, regionID:region, regionObj:regionObj};
  mesh.name = "Region_" + region;
  outline = sectorMap.regionLineGeometry[region].vertices
            .slice(0, sectorMap.regionLineGeometry[region].vertices.length-1) // Drop the last item, the center point
            .map((vert) => {return {x:vert.x, y:vert.z};}); // Remap z to y
  // Create subsectors
  // Calculate minimum distance for points relative to area (smaller area means lower minimum distance, for denser subsectors)
  let minDist = (area/96); // Needs work to scale better for high area sectors
  let subsectorMap = new SubSectorMap(outline, minDist, 64);
  let subsectors = [];

  // let pointMat = new THREE.PointsMaterial({color: 0xFFFFFF});
  // let pointGeometry = subsectorMap.pointArrGeometry;
  // let points = new THREE.Points(pointGeometry, pointMat);
  // //scene.add(points);
  // points.position.add(new THREE.Vector3(0, 2, 0));
  
  for(let subsector = 0; subsector < subsectorMap.regionTriGeometry.length; subsector++)
  //for(let subsector = 0; subsector < 6; subsector++)
  {
    let mesh;
    let subsectorObj = subsectorMap.regions[subsector];
    let area = subsectorObj.area;
    let color = (Math.random()*0xff << 16) | (Math.random()*0xff << 8) | (Math.random()*0xff);
    //let color = (Math.random()*0xff << 16) | (Math.random()*0xff << 8) | 0xff;
    let subsectorMeshNormalMat = new THREE.MeshBasicMaterial({color:color, wireframe: false});
    mesh = new THREE.Mesh(subsectorMap.regionTriGeometry[subsector], subsectorMeshNormalMat);
    mesh.userData = {area:area, subsectorID:subsector, subsectorObj: subsectorObj};
    mesh.name = "Region_"+ region + "_SubSector_" + subsector;
    subsectors.push({
      mesh: mesh,
      area: area,
      color: color,
      subsectorID: subsector      
    });
    // Add subsector mesh to the scene, offsetting it towards the camera to avoid z-fighting (technically y-fighting)
    // scene.add(subsectors[subsector].mesh);
    mesh.position.add(new THREE.Vector3(subsectorObj.cp.x, 1, subsectorObj.cp.y));
  }

  numSubSectors += subsectors.length;

  // Construct the region object and add it to the list
  regions.push({
    sectorMesh: mesh,
    sectorOutline: outline,
    area: area,
    color: color,
    subsectors: subsectors,
    regionID: region
  });
  
  // Add the sector mesh to the scene
  scene.add(regions[region].sectorMesh);
  regions[region].sectorMesh.position.add(new THREE.Vector3(regionObj.cp.x, 0, regionObj.cp.y));
}
let regionGenEnd = performance.now();
console.log("Time to generate Region Meshes and SubSectorMaps", (regionGenEnd - regionGenStart), "ms");  
console.log(regions.length, "Regions");
console.log(numSubSectors, "Sub Sectors")

// Raycasting to find the region the mouse is over
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let oldMouse = new THREE.Vector2();
let mouseDown = false;
let dragging = false;
let mouseHasMoved = false;

// Event handlers
function onMouseMove(event)
{
  if(mouseDown)
  {
    oldMouse.x = mouse.x;
    oldMouse.y = mouse.y;
  }

  mouse.x = (event.clientX / canvasWidth) * 2 - 1;
  mouse.y = -(event.clientY / canvasHeight) * 2 + 1;
  mouseHasMoved = !(mouse.x == oldMouse.x && mouse.y == oldMouse.y);
}
renderer.domElement.addEventListener('mousemove', onMouseMove, false);

// Scroll wheel handling
function scrollZoom(event)
{
  if(camera.zoom - event.deltaY * 0.00025 > 0)
  {
    camera.zoom -= event.deltaY * 0.00025;
    camera.updateProjectionMatrix();
  }
  event.preventDefault(); // Don't scroll the page
}
renderer.domElement.addEventListener('wheel', scrollZoom, {passive:false});

// Controls for dragging the camera
function onMouseDown(event)
{
  mouseDown = true;
  mouse.x = (event.clientX / canvasWidth) * 2 - 1;
  mouse.y = -(event.clientY / canvasHeight) * 2 + 1;
  oldMouse.x = mouse.x;
  oldMouse.y = mouse.y;
  if(mouseHasMoved) dragging = true;
}
renderer.domElement.addEventListener('mousedown', onMouseDown, false);

function onMouseUp(event)
{
  dragging = mouseDown = false;
  oldMouse.x = mouse.x;
  oldMouse.y = mouse.y;
}
renderer.domElement.addEventListener('mouseup', onMouseUp, false);

let oldIntersect = null;
let oldColor = null;
function animate()
{
  requestAnimationFrame(animate);

  // Update times
  time = clock.getElapsedTime();
  delta = clock.getDelta();

  // Update camera position
  cameraAngle = time * cameraRotSpeed;
  
  // Check if the mouse is down, if so drag the camera relative to the vector
  if(dragging)
  {
    let vec = new THREE.Vector2((mouse.x - oldMouse.x) * 150, (mouse.y - oldMouse.y) * 150);
    oldMouse.x = mouse.x;
    oldMouse.y = mouse.y;
    camera.position.set(camera.position.x - vec.x, camera.position.y, camera.position.z + vec.y);
  }

  let lookAt = new THREE.Vector3(camera.position.x, camera.position.y-1, camera.position.z);
  camera.lookAt(lookAt);

  // Update the picking ray with the camera and mouse position
  raycaster.setFromCamera(mouse, camera);

  // Catch objects intersecting the picking ray
  let intersects = raycaster.intersectObjects(scene.children);
  if(intersects[0])
  {
    // // If new intersecting object
    // if(oldIntersect && (oldIntersect.object.uuid != intersects[0].object.uuid)) 
    // {
    //   // revert the last region to it's old color
    //   oldIntersect.object.material.color.set(oldColor);
    //   // Store the new color
    //   oldColor = new THREE.Color(intersects[0].object.material.color.r, intersects[0].object.material.color.g, intersects[0].object.material.color.b);
    //   // Set the new intersects color
    //   intersects[0].object.material.color.set(0xff0000);
    //   oldIntersect = intersects[0];
    // }
    // else if(!oldIntersect)
    // {
    //   oldIntersect = intersects[0];
    //   oldColor = new THREE.Color(intersects[0].object.material.color.r, intersects[0].object.material.color.g, intersects[0].object.material.color.b);
    //   intersects[0].object.material.color.set(0xff0000);            
    // }

    // If new intersecting object
    if(oldIntersect && (oldIntersect.object.uuid != intersects[0].object.uuid))
    {
      //console.log("oldIntersect && (oldIntersect.object.uuid != intersects[0].object.uuid)\n",
      //            oldIntersect, oldIntersect.object.uuid, intersects[o].object.uuid);
      // Remove last region's subsectors
      let subsectors = regions[oldIntersect.object.userData.regionID].subsectors;
      //console.log("Removing subsectors", )      
      for(let i = 0; i < subsectors.length; i++)
      {
        oldIntersect.object.remove(subsectors[i].mesh);
      }
      // Add new region's subsectors
      let newSubsectors = regions[intersects[0].object.userData.regionID].subsectors;
      for(let i = 0; i < newSubsectors.length; i++)
      {
        intersects[0].object.add(newSubsectors[i].mesh);
      }
      oldIntersect = intersects[0];
    }
    else if(!oldIntersect)
    {
      //console.log("!oldIntersect", oldIntersect);
      oldIntersect = intersects[0];
      // Add new region's subsectors
      //console.log(regions[intersects[0].object.userData.regionID].subsectors);
      let newSubsectors = regions[intersects[0].object.userData.regionID].subsectors;
      for(let i = 0; i < newSubsectors.length; i++)
      {
        intersects[0].object.add(newSubsectors[i].mesh);
      }
    }
  }

  renderer.render(scene, camera);
}
animate();

export function GetRenderer() 
{
  return renderer;
}

export function GetScene() 
{
  return scene;
}

export function GetCamera()
{
  return camera;
}

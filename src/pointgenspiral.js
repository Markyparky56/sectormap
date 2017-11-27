import QuadTree from './QuadTree';

export default function genPointsSpiral4(minimumDistance=0)
{
  console.log("Generating points");
  
  // Plot Rings First
  let ringPoints = genConcentricEllipses(1.05045, 64, 512, 36, 36);
  let ringPoints2 = genConcentricEllipses(1.0983, 31, 512, 48, 48);
  
  // Then rotating ellipses to create our spirals
  let ellipseSet1 = genConcentricEllipses(1.095, 32, 768, 48, 27);
  let ellipseSet2 = genConcentricEllipses(1.095, 32, 768, 27, 48);  
  //let ellipseSet3 = genConcentricEllipses(1.11975, 32, 128, 23.9, 13.4);
  //let ellipseSet4 = genConcentricEllipses(1.11975, 32, 128, 13.4, 23.9);
  
  // Combine points into a single array
  let points = combineTypedArrays_Float32([[0,0], ringPoints, ringPoints2, ellipseSet1, ellipseSet2/*, ellipseSet3, ellipseSet4*/]);

  // Process points if we have a minimumDistance requirement
  if(minimumDistance > 0)
  {
    let quadtree = new QuadTree({
      x:0, y:0,
      width: 1600, height: 1600
    }, true); // True for pointQuad

    // Track indexes of points we have to discard
    let discardedPointsIndexes = [];

    // Force 0,0    
    quadtree.insert({x:0, y:0});

    // For each point in points check if it can be inserted into the tree 
    for(let i = 0; i < points.length; i+=2)
    {
      let goodpoint = true;
      let p = {x:points[i], y:points[i+1]};

      let items = quadtree.retrieve({x:p.x, y:p.y});

      if(items.length)
      {
        // For each nearby point, check if this point is too close to any of them
        for(let j = 0; j < items.length; j++)
        {
          let dx, dy;
          dx = items[j].x - p.x;
          dy = items[j].y - p.y;
          let dist = Math.sqrt(dx*dx + dy*dy);
          if(dist < minimumDistance)
          {
            // Too close, discard this point
            discardedPointsIndexes.push(i, i+1);
            goodpoint = false;
            break;
          }
          if(!goodpoint) break;
        }
      }

      if(goodpoint) quadtree.insert({x:p.x, y:p.y});
    }

    // Reconstruct point array without discarded points
    let newPoints = new Float32Array(points.length - discardedPointsIndexes.length);
    for(let placeInOldPoints = 0
          , placeInNewPoints = 0; 
        placeInOldPoints < points.length; 
        placeInOldPoints+=2)
    {
      if(discardedPointsIndexes[0] == placeInOldPoints)
      {
        discardedPointsIndexes.shift();
        discardedPointsIndexes.shift();        
      }
      else
      {
        newPoints.set([points[placeInOldPoints], points[placeInOldPoints+1]], placeInNewPoints);
        placeInNewPoints+=2;        
      }      
    }
    return newPoints;
  }
  else
  {
    return points;
  }  
}

function genEllipsePoints(radiusX, radiusY, rotation, numPoints)
{
  let thetaStep = (2*Math.PI)/numPoints;
  let x, y;
  let i = 0;
  let pts = []
  for(let theta = 0; theta < 2*Math.PI; theta += thetaStep)
  {
    x = radiusX*Math.cos(theta)*Math.cos(rotation) - radiusY*Math.sin(theta)*Math.sin(rotation);
    y = radiusX*Math.cos(theta)*Math.sin(rotation) + radiusY*Math.sin(theta)*Math.cos(rotation);
    pts.push(x);
    pts.push(y);
    i+=2;
    //console.log(i);
  }
  let points = new Float32Array(pts);
  
  return points;
}

function genConcentricEllipses(radiusStep, numSteps, maxPoints, startRadiusX, startRadiusY)
{
  let rotationStep = 2*Math.PI / numSteps;
  let radiusX = startRadiusX, radiusY = startRadiusY;
  
  let pointArrays = [];
  pointArrays.push(genEllipsePoints(radiusX, radiusY, 0, maxPoints/(numSteps+1)));  

  for(let i = 0; i < numSteps-1; i++)
  {
    radiusX *= (radiusStep);
    radiusY *= (radiusStep);
    pointArrays.push(genEllipsePoints(radiusX, radiusY, (rotationStep*(i+1)), maxPoints/(numSteps+1 - (i))));    
  }

  return combineTypedArrays_Float32(pointArrays);
}

function combineTypedArrays_Float32(arrays)
{
  // Combine arrays
  let totalItems = 0;
  for(let i = 0; i < arrays.length; i++)
  {
    totalItems += arrays[i].length;
  }
  let ret = new Float32Array(totalItems);
  let place = 0;
  for(let i = 0; i < arrays.length; i++)
  {
    ret.set(arrays[i], place);
    place+=arrays[i].length;
  }

  return ret;
}

/*

render(1.11975, 32, 160, 24, 13.5);
render(1.11975, 32, 160, 13.5, 24);
render(1.2979, 16, 192, 16, 16);

function drawEllipsePoints(radiusX, radiusY, rotation, numPoints, fill)
{
	if(!fill) fill = "000";
	let thetaStep = (2*Math.PI)/numPoints;
  let x, y;
  for(let theta = 0; theta < 2*Math.PI; theta += thetaStep)
  {
  	x = radiusX*Math.cos(theta)*Math.cos(rotation) - radiusY*Math.sin(theta)*Math.sin(rotation);
    y = radiusX*Math.cos(theta)*Math.sin(rotation) + radiusY*Math.sin(theta)*Math.cos(rotation);
    drawPoint({x:cp.x+x, y:cp.y+y}, fill);
  }
}

function render(radiusStep, numSteps, maxPoints=192, startRadiusX=50, startRadiusY=75)
{
  let rotationStep = 2*Math.PI / numSteps;
  let radiusX = startRadiusX, radiusY = startRadiusY;
  
  drawEllipsePoints(radiusX, radiusY, (rotationStep * 0), maxPoints/(numSteps+1), "#000");
  //console.log("Step: 1");
  
  for(let i = 0; i < numSteps-1; i++)
  {
  	radiusX *= (radiusStep);
    radiusY *= (radiusStep);
  	drawEllipsePoints(radiusX, radiusY, (rotationStep * i), maxPoints/(numSteps+1 - i), "#000");
    //drawEllipse(radiusX, radiusY, (rotationStep*i));
    
    //console.log("Step: " + (i+2));
  }
  //console.log({x:radiusX, y:radiusY});
}

*/

import zeros from 'zeros';
import LinkedList from 'linkedlist';

export default class PoissonDiscSampler2D_Polygon
{
  constructor(vertices, minDist, maxPoints, polyScale=1, maxTries=30)
  {
    // Find bounding box for vertices
    this.boundingBoxCorners = this.findBoundingBox(vertices);
    this.p0 = this.boundingBoxCorners.p0;
    this.p1 = this.boundingBoxCorners.p1;
    this.cp = this.boundingBoxCorners.cp;
    this.dimensions = {x: this.p1.x - this.p0.x, y: this.p1.y - this.p0.y};
    this.vertices = vertices;
    this.polyScale = polyScale;

    this.minDist = minDist;
    this.maxPoints = maxPoints;
    this.pointsToGenerate = maxTries;

    this.cellSize = minDist / Math.SQRT2;
    this.gridWidth = ((this.dimensions.x / this.cellSize) | 0) + 1;
    this.gridHeight = ((this.dimensions.y / this.cellSize) | 0) + 1;

    // grid stores references to pointList for lookup
    this.grid = zeros([this.gridWidth, this.gridHeight], "uint32");
    
    this.activeList = new LinkedList();
    this.pointList = [-1];
  }

  Sample()
  {
    this.addFirstPoint(this.grid, this.activeList, this.pointList);

    while(this.activeList.length > 0 && (this.pointList.length < this.maxPoints))
    {
      let listIndex = (Math.random() * this.activeList.length) | 0;

      let point = this.activeList.at(listIndex);
      let found = false;

      for(let k = 0; k < this.pointsToGenerate; k++)
      {
        found |= this.addNextPoint(this.grid, this.activeList, this.pointList, point);
      }

      if(!found)
      {
        for(let i = 0; i < listIndex; i++)
        {
          this.activeList.next();
        }
        this.activeList.removeCurrent();
        this.activeList.resetCursor();
      }
    }
    this.pointList.shift(); // Remove our dummy value hogging index 0 before returning the point list
    return this.pointList;
  }

  addNextPoint(grid, activeList, pointList, point)
  {
    let found = false;
    let newPoint = this.generateRandomAround(point, this.minDist);

    // Extension to the traditional algorithm, we restrict the bounding box check to
    // the size of our defined polygon, and require the point to be within that polygon
    // to be valid, along with the standard requirement of distance from other points
    if((newPoint.x >= this.p0.x) && (newPoint.x < this.p1.x) && (newPoint.y > this.p0.y) && (newPoint.y < this.p1.y))
    {
      if(this.pointInScaledPoly(this.vertices, newPoint, this.cp, this.polyScale))
      {
        let newPointIndex = this.pointToGrid(newPoint, this.p0, this.cellSize);
        let tooClose = false;

        for(let i = Math.max(0, newPointIndex.x - 2); (i < Math.min(this.gridWidth, newPointIndex.x + 3)) && !tooClose; i++)
        {
          for(let j = Math.max(0, newPointIndex.y - 2); (j < Math.min(this.gridHeight, newPointIndex.y + 3)) && !tooClose; j++)
          {
            let index = grid.get(i, j)
            if(index != 0)
            {
              if(this.distance(pointList[index], newPoint) < this.minDist)
              {
                tooClose = true;
              }
            }
          }
        }

        if(!tooClose)
        {
          found = true;
          activeList.push(newPoint);
          pointList.push(newPoint);
          grid.set(newPointIndex.x, newPointIndex.y, pointList.length-1);
        }
      }
    }
    return found;
  }

  addPoint(point)
  {
    let index = this.pointToGrid(point, this.p0, this.cellSize);
    this.activeList.push(point);
    this.pointList.push(point);
    this.grid.set(index.x, index.y, this.pointList.length-1);
  }

  addFirstPoint(grid, activeList, pointList)
  {
    let p = {};
    // Get a random point within the polygon
    do
    {
      let d = Math.random();
      let xr = this.p0.x + this.dimensions.x * d;

      d = Math.random();
      let yr = this.p0.y + this.dimensions.y * d;

      p = {x:xr, y:yr};
    } while(!this.pointInScaledPoly(this.vertices, p, this.cp, this.polyScale));
    let index = this.pointToGrid(p, this.p0, this.cellSize);

    activeList.push(p);
    pointList.push(p);
    grid.set(index.x, index.y, 1);
  }

  pointToGrid(p, origin, cellSize)
  {
    return {
      x: ((p.x - origin.x) / cellSize) | 0,
      y: ((p.y - origin.y) / cellSize) | 0
    };
  }

  generateRandomAround(centre, minDist)
  {
    let d = Math.random();
    let radius = (minDist + minDist * d);

    d = Math.random();
    let angle = 2*Math.PI*d;

    let newX = radius*Math.sin(angle);
    let newY = radius*Math.cos(angle);

    return {
      x: centre.x + newX,
      y: centre.y + newY
    };
  }

  distance(p1, p2)
  {
    return Math.sqrt((p2.x - p1.x)*(p2.x - p1.x) + (p2.y - p1.y)*(p2.y - p1.y));
  }

  findBoundingBox(vertices)
  {
    let minX, minY, maxX, maxY;
    minX = minY = Infinity;
    maxX = maxY = -Infinity;
    for(let i = 0; i < vertices.length; i++)
    {
      if(vertices[i].x > maxX) maxX = vertices[i].x;
      if(vertices[i].x < minX) minX = vertices[i].x;
      if(vertices[i].y > maxY) maxY = vertices[i].y;
      if(vertices[i].y < minY) minY = vertices[i].y;
    }
    return {
      p0: {
        x: minX,
        y: minY
      },
      p1: {
        x: maxX,
        y: maxY
      },
      cp: {
        x: ((maxX - minX) * 0.5) + minX,
        y: ((maxY - minY) * 0.5) + minY
      }
    };
  }

  // Original function from: https://stackoverflow.com/a/2922778/1941205, adapted for JS
  pointInPoly(vertices, point)
  {
    let ret = false;
    for(let i = 0, j = vertices.length-1; i < vertices.length; j = i++)
    {
      if(((vertices[i].y > point.y) != (vertices[j].y > point.y))
      && (point.x < (vertices[j].x - vertices[i].x) * (point.y - vertices[i].y) / (vertices[j].y - vertices[i].y) + vertices[i].x))
      {
        ret = !ret;
      }
    }
    return ret;
  }

  // Simple adaption to scale the polygon's vertices 
  // given their (bounding box) centre point and a scale factor
  pointInScaledPoly(vertices, point, cp, scale) 
  {
    let ret = false;
    let scaledVertices = [];
    for(let v = 0; v < vertices.length; v++)
    {
      scaledVertices.push({
        x: (scale * (vertices[v].x - cp.x)) + cp.x,
        y: (scale * (vertices[v].y - cp.y)) + cp.y
      });
    }
    for(let i = 0, j = scaledVertices.length-1; i < scaledVertices.length; j = i++)
    {
      if(((scaledVertices[i].y > point.y) != (scaledVertices[j].y > point.y))
      && (point.x < (scaledVertices[j].x - scaledVertices[i].x) * (point.y - scaledVertices[i].y) / (scaledVertices[j].y - scaledVertices[i].y) + scaledVertices[i].x))
      {
        ret = !ret;
      }
    }
    return ret;
  }
}
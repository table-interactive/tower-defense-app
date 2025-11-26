from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

game_state = {"towers": []}

class TowerPlacement(BaseModel):
    towerId: str
    x: int
    y: int

@app.post("/tower/place")
def place_tower(data: TowerPlacement):
    game_state["towers"].append(data.dict())
    return {"message": "Tower placed", "current": game_state["towers"]}

@app.get("/state")
def get_state():
    return game_state

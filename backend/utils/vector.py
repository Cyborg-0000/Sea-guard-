import math

class Vector2D:
    def __init__(self, u: float, v: float):
        """
        u: Eastward velocity (e.g. m/s)
        v: Northward velocity (e.g. m/s)
        """
        self.u = u
        self.v = v

    @classmethod
    def from_speed_bearing(cls, speed: float, bearing_degrees: float):
        """
        Create a vector from speed and bearing (direction it is pointing TOWARDS).
        0 = North, 90 = East, 180 = South, 270 = West.
        """
        bearing_rad = math.radians(bearing_degrees)
        u = speed * math.sin(bearing_rad)
        v = speed * math.cos(bearing_rad)
        return cls(u, v)

    def magnitude(self) -> float:
        return math.sqrt(self.u**2 + self.v**2)

    def bearing(self) -> float:
        """Returns bearing in degrees (0 = North, 90 = East)"""
        if self.u == 0 and self.v == 0:
            return 0.0
        deg = math.degrees(math.atan2(self.u, self.v))
        return (deg + 360) % 360

    def __add__(self, other):
        return Vector2D(self.u + other.u, self.v + other.v)

    def __sub__(self, other):
        return Vector2D(self.u - other.u, self.v - other.v)

    def __mul__(self, scalar: float):
        return Vector2D(self.u * scalar, self.v * scalar)
        
    def __rmul__(self, scalar: float):
        return self.__mul__(scalar)

    def normalize(self):
        mag = self.magnitude()
        if mag == 0:
            return Vector2D(0, 0)
        return Vector2D(self.u / mag, self.v / mag)

    def __repr__(self):
        return f"Vector2D({self.u:.3f}, {self.v:.3f}) | mag={self.magnitude():.3f}, brg={self.bearing():.1f}°"

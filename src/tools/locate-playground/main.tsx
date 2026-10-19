import { MapProvider } from "../../shared/map/context";
import { mount } from "../../shared/mount";
import { App } from "./App";

mount(
  <MapProvider>
    <App />
  </MapProvider>,
);

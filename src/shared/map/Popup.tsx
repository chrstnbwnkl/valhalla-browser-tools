import { Popup as MapLibrePopup } from "maplibre-gl";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useLoadedMap } from "./context";

type Props = {
  lngLat: [lon: number, lat: number];
  /** Called when closed with its × button. */
  onClose: () => void;
  children: ReactNode;
};

/** A MapLibre popup showing `children`. Only its × button closes it. */
export function Popup({ lngLat, onClose, children }: Props) {
  const map = useLoadedMap();
  const [element] = useState(() => document.createElement("div"));
  const popup = useRef<MapLibrePopup | null>(null);
  const [lon, lat] = lngLat;

  const position = useEffectEvent(() => lngLat);
  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    const instance = new MapLibrePopup({
      closeOnClick: false,
      maxWidth: "none",
    })
      .setLngLat(position())
      .setDOMContent(element)
      .addTo(map);
    instance.on("close", close);
    popup.current = instance;
    return () => {
      instance.off("close", close);
      instance.remove();
      popup.current = null;
    };
  }, [map, element]);

  useEffect(() => {
    popup.current?.setLngLat([lon, lat]);
  }, [lon, lat]);

  return createPortal(children, element);
}

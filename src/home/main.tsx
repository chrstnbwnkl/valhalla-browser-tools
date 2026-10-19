import { mount } from "../shared/mount";
import { App } from "./App";
import option from "./option-of-the-day.json";

mount(<App option={option} />);

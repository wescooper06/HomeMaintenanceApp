import { formatFullDayLabel, toWeekWeatherFallback } from "../../../services/plannerService.js";
import styles from "../PlannerPage.module.css";

import { usePlanner } from "./usePlanner.js";

export default function WeatherModal({ date }) {
  const { snapshot, actions } = usePlanner();
  const weather = snapshot.weatherByDate[date] || toWeekWeatherFallback(date);
  return (
    <div className={styles["weather-modal-card"]} role="dialog" aria-modal="true" aria-label="Daily weather forecast">
      <header className={styles["weather-modal-header"]}>
        <div>
          <h3 className={styles["weather-modal-title"]}>{formatFullDayLabel(date)}</h3>
          <p className={styles["weather-modal-location"]}>Mirrormont, WA</p>
        </div>
        <button type="button" className={styles["weather-modal-close"]} data-action="weather-close" aria-label="Close weather modal" onClick={actions.closeWeather}>X</button>
      </header>
      <div className={styles["weather-modal-body"]}>
        <div className={styles["weather-modal-summary"]}>
          <span className={styles["weather-modal-summary-icon"]} aria-hidden="true">{weather.icon}</span>
          <span>{weather.condition}</span>
        </div>
        <div className={styles["weather-modal-grid"]}>
          <div className={styles["weather-modal-item"]}><strong>High:</strong> {weather.high}</div>
          <div className={styles["weather-modal-item"]}><strong>Low:</strong> {weather.low}</div>
          <div className={styles["weather-modal-item"]}><strong>Precipitation:</strong> {weather.precipitation}</div>
          <div className={styles["weather-modal-item"]}><strong>Wind:</strong> {weather.wind}</div>
          <div className={styles["weather-modal-item"]}><strong>Humidity:</strong> {weather.humidity}</div>
        </div>
      </div>
    </div>
  );
}
